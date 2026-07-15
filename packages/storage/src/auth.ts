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

export class PostgresAuthStore extends JsonAuthStore {
  private readonly pool: pg.Pool;
  private schemaReady?: Promise<void>;

  constructor(databaseUrl: string, pool?: pg.Pool) {
    super();
    this.pool = pool ?? new pg.Pool({ connectionString: databaseUrl });
  }

  protected async load(): Promise<AuthData> {
    await this.ensureSchema();
    const result = await this.pool.query<{ document: AuthData }>("select document from auth_state where id = 1");
    return normalizeAuthData(result.rows[0]?.document ?? structuredClone(emptyAuthData));
  }

  protected async save(data: AuthData): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `insert into auth_state (id, document, updated_at)
       values (1, $1::jsonb, now())
       on conflict (id)
       do update set document = excluded.document, updated_at = excluded.updated_at`,
      [JSON.stringify(data)]
    );
  }

  private ensureSchema(): Promise<void> {
    this.schemaReady ??= this.pool
      .query(
        `create table if not exists auth_state (
          id integer primary key,
          document jsonb not null,
          updated_at timestamptz not null default now()
        );`
      )
      .then(() => undefined)
      .catch((error) => {
        this.schemaReady = undefined;
        throw error;
      });

    return this.schemaReady;
  }
}

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

function normalizeAuthData(data: AuthData): AuthData {
  return {
    users: data.users ?? {},
    sessions: data.sessions ?? {}
  };
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
