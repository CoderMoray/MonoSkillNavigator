import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

export interface PublicUser {
  id: string;
  username: string;
  role: "admin" | "user";
  createdAt: string;
  updatedAt: string;
}

interface StoredUser extends PublicUser {
  passwordHash: string;
}

interface StoredSession {
  id: string;
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface AuthData {
  users: Record<string, StoredUser>;
  sessions: Record<string, StoredSession>;
}

export interface LoginResult {
  token: string;
  user: PublicUser;
  expiresAt: string;
}

export interface AuthStore {
  register(username: string, password: string): Promise<PublicUser>;
  login(username: string, password: string): Promise<LoginResult>;
  logout(token: string): Promise<void>;
  getUserByToken(token: string): Promise<PublicUser | undefined>;
  getUserByUsername(username: string): Promise<PublicUser | undefined>;
  changePassword(token: string, currentPassword: string, newPassword: string): Promise<PublicUser>;
}

const emptyAuthData: AuthData = {
  users: {},
  sessions: {}
};

abstract class JsonAuthStore implements AuthStore {
  async register(username: string, password: string): Promise<PublicUser> {
    const normalizedUsername = normalizeUsername(username);
    assertPassword(password);
    const data = await this.load();

    if (Object.values(data.users).some((user) => user.username.toLowerCase() === normalizedUsername.toLowerCase())) {
      throw new Error("Username already exists");
    }

    const now = new Date().toISOString();
    const isFirstUser = Object.keys(data.users).length === 0;
    const user: StoredUser = {
      id: randomUUID(),
      username: normalizedUsername,
      role: isFirstUser ? "admin" : "user",
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now
    };

    data.users[user.id] = user;
    await this.save(data);
    return toPublicUser(user);
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const normalizedUsername = normalizeUsername(username);
    const data = await this.load();
    const user = Object.values(data.users).find(
      (item) => item.username.toLowerCase() === normalizedUsername.toLowerCase()
    );

    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error("Invalid username or password");
    }

    const token = `skp_${randomBytes(32).toString("base64url")}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString();
    const session: StoredSession = {
      id: randomUUID(),
      tokenHash: hashToken(token),
      userId: user.id,
      createdAt: now.toISOString(),
      expiresAt
    };

    data.sessions[session.id] = session;
    pruneExpiredSessions(data);
    await this.save(data);

    return {
      token,
      user: toPublicUser(user),
      expiresAt
    };
  }

  async logout(token: string): Promise<void> {
    const data = await this.load();
    const tokenHash = hashToken(token);

    for (const [id, session] of Object.entries(data.sessions)) {
      if (session.tokenHash === tokenHash) {
        delete data.sessions[id];
      }
    }

    await this.save(data);
  }

  async getUserByToken(token: string): Promise<PublicUser | undefined> {
    const data = await this.load();
    pruneExpiredSessions(data);
    const tokenHash = hashToken(token);
    const session = Object.values(data.sessions).find((item) => item.tokenHash === tokenHash);
    if (!session) {
      await this.save(data);
      return undefined;
    }

    const user = data.users[session.userId];
    await this.save(data);
    return user ? toPublicUser(user) : undefined;
  }

  async getUserByUsername(username: string): Promise<PublicUser | undefined> {
    const normalizedUsername = normalizeUsername(username);
    const data = await this.load();
    const user = Object.values(data.users).find(
      (item) => item.username.toLowerCase() === normalizedUsername.toLowerCase()
    );
    return user ? toPublicUser(user) : undefined;
  }

  async changePassword(token: string, currentPassword: string, newPassword: string): Promise<PublicUser> {
    assertPassword(newPassword);
    const data = await this.load();
    pruneExpiredSessions(data);
    const tokenHash = hashToken(token);
    const session = Object.values(data.sessions).find((item) => item.tokenHash === tokenHash);
    const user = session ? data.users[session.userId] : undefined;

    if (!user) {
      throw new Error("Unauthorized");
    }

    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new Error("Current password is incorrect");
    }

    user.passwordHash = hashPassword(newPassword);
    user.updatedAt = new Date().toISOString();
    await this.save(data);
    return toPublicUser(user);
  }

  protected abstract load(): Promise<AuthData>;
  protected abstract save(data: AuthData): Promise<void>;
}

export class FileAuthStore extends JsonAuthStore {
  private readonly usersPath: string;

  constructor(dataDir = ".data") {
    super();
    const baseDir = path.isAbsolute(dataDir) ? "" : process.env.INIT_CWD ?? process.cwd();
    this.usersPath = path.join(path.resolve(baseDir, dataDir), "users.json");
  }

  protected async load(): Promise<AuthData> {
    try {
      const raw = await readFile(this.usersPath, "utf8");
      return normalizeAuthData(JSON.parse(raw) as AuthData);
    } catch (error) {
      if (isNotFoundError(error)) {
        return structuredClone(emptyAuthData);
      }
      throw error;
    }
  }

  protected async save(data: AuthData): Promise<void> {
    await mkdir(path.dirname(this.usersPath), { recursive: true });
    const tempPath = `${this.usersPath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tempPath, this.usersPath);
  }
}

type AuthDatabaseTimestamp = Date | string;

interface DatabaseUserRow {
  id: string;
  username: string;
  role: "admin" | "user";
  password_hash: string;
  created_at: AuthDatabaseTimestamp;
  updated_at: AuthDatabaseTimestamp;
}

export class PostgresAuthStore implements AuthStore {
  private readonly pool: pg.Pool;
  private schemaReady?: Promise<void>;

  constructor(databaseUrl: string, pool?: pg.Pool) {
    this.pool = pool ?? new pg.Pool({ connectionString: databaseUrl });
  }

  async register(username: string, password: string): Promise<PublicUser> {
    const normalizedUsername = normalizeUsername(username);
    assertPassword(password);
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock($1::bigint)", [81024001]);
      const count = await client.query<{ count: string }>("select count(*)::text as count from platform_users");
      const now = new Date().toISOString();
      const user: StoredUser = {
        id: randomUUID(),
        username: normalizedUsername,
        role: Number(count.rows[0]?.count ?? 0) === 0 ? "admin" : "user",
        passwordHash: hashPassword(password),
        createdAt: now,
        updatedAt: now
      };

      try {
        await client.query(
          `insert into platform_users (id, username, role, password_hash, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6)`,
          [user.id, user.username, user.role, user.passwordHash, user.createdAt, user.updatedAt]
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new Error("Username already exists");
        }
        throw error;
      }

      await client.query("commit");
      return toPublicUser(user);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const normalizedUsername = normalizeUsername(username);
    await this.ensureSchema();
    const result = await this.pool.query<DatabaseUserRow>(
      `select id, username, role, password_hash, created_at, updated_at
       from platform_users
       where lower(username) = lower($1)
       limit 1`,
      [normalizedUsername]
    );
    const user = result.rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new Error("Invalid username or password");
    }

    const token = `skp_${randomBytes(32).toString("base64url")}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString();
    await this.pool.query("delete from auth_sessions where expires_at <= now()");
    await this.pool.query(
      `insert into auth_sessions (id, token_hash, user_id, created_at, expires_at)
       values ($1, $2, $3, $4, $5)`,
      [randomUUID(), hashToken(token), user.id, now.toISOString(), expiresAt]
    );

    return {
      token,
      user: toPublicDatabaseUser(user),
      expiresAt
    };
  }

  async logout(token: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query("delete from auth_sessions where token_hash = $1", [hashToken(token)]);
  }

  async getUserByToken(token: string): Promise<PublicUser | undefined> {
    await this.ensureSchema();
    await this.pool.query("delete from auth_sessions where expires_at <= now()");
    const result = await this.pool.query<DatabaseUserRow>(
      `select u.id, u.username, u.role, u.password_hash, u.created_at, u.updated_at
       from auth_sessions s
       join platform_users u on u.id = s.user_id
       where s.token_hash = $1 and s.expires_at > now()
       limit 1`,
      [hashToken(token)]
    );

    return result.rows[0] ? toPublicDatabaseUser(result.rows[0]) : undefined;
  }

  async getUserByUsername(username: string): Promise<PublicUser | undefined> {
    const normalizedUsername = normalizeUsername(username);
    await this.ensureSchema();
    const result = await this.pool.query<DatabaseUserRow>(
      `select id, username, role, password_hash, created_at, updated_at
       from platform_users
       where lower(username) = lower($1)
       limit 1`,
      [normalizedUsername]
    );

    return result.rows[0] ? toPublicDatabaseUser(result.rows[0]) : undefined;
  }

  async changePassword(token: string, currentPassword: string, newPassword: string): Promise<PublicUser> {
    assertPassword(newPassword);
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from auth_sessions where expires_at <= now()");
      const result = await client.query<DatabaseUserRow>(
        `select u.id, u.username, u.role, u.password_hash, u.created_at, u.updated_at
         from auth_sessions s
         join platform_users u on u.id = s.user_id
         where s.token_hash = $1
         for update`,
        [hashToken(token)]
      );
      const user = result.rows[0];

      if (!user) {
        throw new Error("Unauthorized");
      }
      if (!verifyPassword(currentPassword, user.password_hash)) {
        throw new Error("Current password is incorrect");
      }

      const updatedAt = new Date().toISOString();
      const passwordHash = hashPassword(newPassword);
      await client.query(
        `update platform_users
         set password_hash = $1, updated_at = $2
         where id = $3`,
        [passwordHash, updatedAt, user.id]
      );
      await client.query("commit");

      return {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: toAuthIsoString(user.created_at),
        updatedAt
      };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async migrateLegacyAuth(client: pg.PoolClient): Promise<void> {
    const migrationName = "auth-json-to-relational-v1";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    const existing = await client.query<{ count: string }>("select count(*)::text as count from platform_users");
    const legacyTable = await client.query<{ table_name: string | null }>(
      "select to_regclass('public.auth_state') as table_name"
    );

    if (Number(existing.rows[0]?.count ?? 0) === 0 && legacyTable.rows[0]?.table_name) {
      const result = await client.query<{ document: AuthData }>("select document from auth_state where id = 1");
      const data = normalizeAuthData(result.rows[0]?.document ?? structuredClone(emptyAuthData));

      for (const user of Object.values(data.users)) {
        await client.query(
          `insert into platform_users (id, username, role, password_hash, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (id) do nothing`,
          [user.id, user.username, user.role, user.passwordHash, user.createdAt, user.updatedAt]
        );
      }

      for (const session of Object.values(data.sessions)) {
        await client.query(
          `insert into auth_sessions (id, token_hash, user_id, created_at, expires_at)
           values ($1, $2, $3, $4, $5)
           on conflict (id) do nothing`,
          [session.id, session.tokenHash, session.userId, session.createdAt, session.expiresAt]
        );
      }
    }

    await client.query(
      `insert into platform_schema_migrations (name, applied_at)
       values ($1, now())
       on conflict (name) do nothing`,
      [migrationName]
    );
  }

  private ensureSchema(): Promise<void> {
    this.schemaReady ??= (async () => {
      const client = await this.pool.connect();
      try {
        await client.query("begin");
        await client.query("select pg_advisory_xact_lock($1::bigint)", [81024002]);
        await client.query(relationalAuthSchema);
        await this.migrateLegacyAuth(client);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    })().catch((error) => {
      this.schemaReady = undefined;
      throw error;
    });

    return this.schemaReady;
  }
}

const relationalAuthSchema = `
  create table if not exists platform_schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );

  create table if not exists platform_users (
    id text primary key,
    username text not null,
    role text not null check (role in ('admin', 'user')),
    password_hash text not null,
    created_at timestamptz not null,
    updated_at timestamptz not null
  );

  create unique index if not exists platform_users_username_lower_key
    on platform_users (lower(username));

  create table if not exists auth_sessions (
    id text primary key,
    token_hash text not null unique,
    user_id text not null references platform_users(id) on delete cascade,
    created_at timestamptz not null,
    expires_at timestamptz not null
  );

  create index if not exists auth_sessions_user_id_idx on auth_sessions (user_id);
  create index if not exists auth_sessions_expires_at_idx on auth_sessions (expires_at);
`;

export function createAuthStoreFromEnv(env: NodeJS.ProcessEnv = process.env): AuthStore {
  const storeType = env.REGISTRY_STORE ?? (env.DATABASE_URL ? "postgres" : "file");

  if (storeType === "postgres") {
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when REGISTRY_STORE=postgres");
    }
    return new PostgresAuthStore(env.DATABASE_URL);
  }

  return new FileAuthStore(env.DATA_DIR ?? ".data");
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, salt, hash] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const actual = Buffer.from(scryptSync(password, salt, 64).toString("base64url"));
  const expected = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeUsername(username: string): string {
  const normalized = username.trim();
  if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(normalized)) {
    throw new Error("Username must be 3-64 characters and contain only letters, numbers, dots, underscores, or hyphens");
  }
  return normalized;
}

function assertPassword(password: string): void {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
}

function pruneExpiredSessions(data: AuthData): void {
  const now = Date.now();
  for (const [id, session] of Object.entries(data.sessions)) {
    if (new Date(session.expiresAt).getTime() <= now) {
      delete data.sessions[id];
    }
  }
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function toPublicDatabaseUser(user: DatabaseUserRow): PublicUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: toAuthIsoString(user.created_at),
    updatedAt: toAuthIsoString(user.updated_at)
  };
}

function toAuthIsoString(value: AuthDatabaseTimestamp): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function normalizeAuthData(data: AuthData): AuthData {
  return {
    users: data.users ?? {},
    sessions: data.sessions ?? {}
  };
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
