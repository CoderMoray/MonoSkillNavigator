import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { isRegistrationEmailVerificationRequired } from "./env";

export interface PublicUser {
  id: string;
  username: string;
  email: string | null;
  emailVerified: boolean;
  role: "admin" | "user";
  createdAt: string;
  updatedAt: string;
}

interface StoredUser extends PublicUser {
  passwordHash: string;
  emailVerifiedAt: string | null;
  pendingEmailVerification?: {
    tokenHash: string;
    expiresAt: string;
  };
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
  register(username: string, password: string, email: string, options?: RegisterOptions): Promise<PublicUser>;
  login(username: string, password: string): Promise<LoginResult>;
  logout(token: string): Promise<void>;
  getUserByToken(token: string): Promise<PublicUser | undefined>;
  getUserByUsername(username: string): Promise<PublicUser | undefined>;
  listUsers(): Promise<PublicUser[]>;
  changePassword(token: string, currentPassword: string, newPassword: string): Promise<PublicUser>;
  deleteAccount(token: string, password: string): Promise<void>;
  createEmailVerificationToken(userId: string, expiresMs: number): Promise<string>;
  verifyEmail(token: string): Promise<PublicUser>;
  resendEmailVerification(username: string, password: string, expiresMs: number): Promise<{ user: PublicUser; token: string }>;
  validateUnverifiedUserForVerification(username: string, password: string): Promise<PublicUser>;
  purgeExpiredUnverifiedUsers(retentionDays: number): Promise<number>;
}

export interface RegisterOptions {
  autoVerifyEmail?: boolean;
}

const emptyAuthData: AuthData = {
  users: {},
  sessions: {}
};

abstract class JsonAuthStore implements AuthStore {
  async register(
    username: string,
    password: string,
    email: string,
    options: RegisterOptions = {}
  ): Promise<PublicUser> {
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = normalizeEmail(email);
    assertPassword(password);
    const data = await this.load();

    if (Object.values(data.users).some((user) => user.username.toLowerCase() === normalizedUsername.toLowerCase())) {
      throw new Error("Username already exists");
    }

    if (
      Object.values(data.users).some(
        (user) => user.email !== null && user.email.toLowerCase() === normalizedEmail
      )
    ) {
      throw new Error("Email already exists");
    }

    const now = new Date().toISOString();
    const isFirstUser = Object.keys(data.users).length === 0;
    const user: StoredUser = {
      id: randomUUID(),
      username: normalizedUsername,
      email: normalizedEmail,
      emailVerified: options.autoVerifyEmail === true,
      emailVerifiedAt: options.autoVerifyEmail === true ? now : null,
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
    const lookup = resolveLoginIdentifier(username);
    const data = await this.load();
    const user = Object.values(data.users).find((item) => {
      if (item.username.toLowerCase() === lookup.raw.toLowerCase()) {
        return true;
      }
      return item.email !== null && item.email.toLowerCase() === lookup.raw.toLowerCase();
    });

    if (!user) {
      throw new Error("Invalid username");
    }
    if (!verifyPassword(password, user.passwordHash)) {
      throw new Error("Invalid password");
    }

    if (isRegistrationEmailVerificationRequired() && !user.emailVerifiedAt) {
      throw new Error("Email not verified");
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

  async listUsers(): Promise<PublicUser[]> {
    const data = await this.load();
    return Object.values(data.users)
      .map(toPublicUser)
      .sort((a, b) => a.username.localeCompare(b.username));
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

  async deleteAccount(token: string, password: string): Promise<void> {
    const data = await this.load();
    pruneExpiredSessions(data);
    const tokenHash = hashToken(token);
    const session = Object.values(data.sessions).find((item) => item.tokenHash === tokenHash);
    const user = session ? data.users[session.userId] : undefined;

    if (!user) {
      throw new Error("Unauthorized");
    }

    if (!verifyPassword(password, user.passwordHash)) {
      throw new Error("Current password is incorrect");
    }

    assertCanDeleteUser(user, Object.values(data.users));

    for (const [id, item] of Object.entries(data.sessions)) {
      if (item.userId === user.id) {
        delete data.sessions[id];
      }
    }
    delete data.users[user.id];
    await this.save(data);
  }

  async createEmailVerificationToken(userId: string, expiresMs: number): Promise<string> {
    const data = await this.load();
    const user = data.users[userId];
    if (!user) {
      throw new Error("User not found");
    }
    if (user.emailVerifiedAt) {
      throw new Error("Email already verified");
    }
    if (!user.email) {
      throw new Error("User email is missing");
    }

    const rawToken = `ev_${randomBytes(32).toString("base64url")}`;
    user.pendingEmailVerification = {
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + expiresMs).toISOString()
    };
    user.updatedAt = new Date().toISOString();
    await this.save(data);
    return rawToken;
  }

  async verifyEmail(token: string): Promise<PublicUser> {
    const data = await this.load();
    const tokenHash = hashToken(token.trim());
    const user = Object.values(data.users).find(
      (item) => item.pendingEmailVerification?.tokenHash === tokenHash
    );

    if (!user?.pendingEmailVerification) {
      throw new Error("Invalid or expired verification token");
    }

    if (new Date(user.pendingEmailVerification.expiresAt).getTime() <= Date.now()) {
      delete user.pendingEmailVerification;
      await this.save(data);
      throw new Error("Invalid or expired verification token");
    }

    const now = new Date().toISOString();
    user.emailVerifiedAt = now;
    user.emailVerified = true;
    delete user.pendingEmailVerification;
    user.updatedAt = now;
    await this.save(data);
    return toPublicUser(user);
  }

  async resendEmailVerification(
    username: string,
    password: string,
    expiresMs: number
  ): Promise<{ user: PublicUser; token: string }> {
    const user = await this.validateUnverifiedUserForVerification(username, password);
    const token = await this.createEmailVerificationToken(user.id, expiresMs);
    const data = await this.load();
    const refreshed = data.users[user.id];
    if (!refreshed) {
      throw new Error("User not found");
    }
    return { user: toPublicUser(refreshed), token };
  }

  async validateUnverifiedUserForVerification(username: string, password: string): Promise<PublicUser> {
    const normalizedUsername = normalizeUsername(username);
    const data = await this.load();
    const user = Object.values(data.users).find(
      (item) => item.username.toLowerCase() === normalizedUsername.toLowerCase()
    );

    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error("Invalid username or password");
    }
    if (user.emailVerifiedAt) {
      throw new Error("Email already verified");
    }
    if (!user.email) {
      throw new Error("User email is missing");
    }

    return toPublicUser(user);
  }

  async purgeExpiredUnverifiedUsers(retentionDays: number): Promise<number> {
    if (retentionDays <= 0) {
      return 0;
    }

    const data = await this.load();
    const cutoffMs = Date.now() - retentionDays * 86_400_000;
    const adminCount = Object.values(data.users).filter((user) => user.role === "admin").length;
    let adminsMarkedForDeletion = 0;
    const userIdsToDelete: string[] = [];

    for (const user of Object.values(data.users)) {
      if (user.emailVerifiedAt) {
        continue;
      }
      if (new Date(user.createdAt).getTime() > cutoffMs) {
        continue;
      }
      if (user.role === "admin") {
        if (adminCount - adminsMarkedForDeletion <= 1) {
          continue;
        }
        adminsMarkedForDeletion += 1;
      }
      userIdsToDelete.push(user.id);
    }

    if (userIdsToDelete.length === 0) {
      return 0;
    }

    const deleteSet = new Set(userIdsToDelete);
    for (const userId of userIdsToDelete) {
      delete data.users[userId];
    }
    for (const [sessionId, session] of Object.entries(data.sessions)) {
      if (deleteSet.has(session.userId)) {
        delete data.sessions[sessionId];
      }
    }

    await this.save(data);
    return userIdsToDelete.length;
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
  email: string | null;
  email_verified_at: AuthDatabaseTimestamp | null;
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

  async register(
    username: string,
    password: string,
    email: string,
    options: RegisterOptions = {}
  ): Promise<PublicUser> {
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = normalizeEmail(email);
    assertPassword(password);
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock($1::bigint)", [81024001]);
      const count = await client.query<{ count: string }>("select count(*)::text as count from platform_users");
      const existing = await client.query<{ username: string; email: string | null }>(
        `select username, email
         from platform_users
         where lower(username) = lower($1)
            or (email is not null and lower(email) = lower($2))
         limit 1`,
        [normalizedUsername, normalizedEmail]
      );
      if (existing.rows[0]) {
        if (existing.rows[0].username.toLowerCase() === normalizedUsername.toLowerCase()) {
          throw new Error("Username already exists");
        }
        throw new Error("Email already exists");
      }

      const now = new Date().toISOString();
      const emailVerifiedAt = options.autoVerifyEmail === true ? now : null;
      const user: StoredUser = {
        id: randomUUID(),
        username: normalizedUsername,
        email: normalizedEmail,
        emailVerified: emailVerifiedAt !== null,
        emailVerifiedAt,
        role: Number(count.rows[0]?.count ?? 0) === 0 ? "admin" : "user",
        passwordHash: hashPassword(password),
        createdAt: now,
        updatedAt: now
      };

      try {
        await client.query(
          `insert into platform_users (id, username, email, email_verified_at, role, password_hash, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            user.id,
            user.username,
            user.email,
            user.emailVerifiedAt,
            user.role,
            user.passwordHash,
            user.createdAt,
            user.updatedAt
          ]
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
    await this.ensureSchema();
    const lookup = resolveLoginIdentifier(username);
    const result = await this.pool.query<DatabaseUserRow>(
      `select id, username, email, email_verified_at, role, password_hash, created_at, updated_at
       from platform_users
       where (lower(username) = lower($1))
          or (email is not null and lower(email) = lower($1))
       limit 1`,
      [lookup.raw]
    );
    const user = result.rows[0];

    if (!user) {
      throw new Error("Invalid username");
    }
    if (!verifyPassword(password, user.password_hash)) {
      throw new Error("Invalid password");
    }

    if (isRegistrationEmailVerificationRequired() && !user.email_verified_at) {
      throw new Error("Email not verified");
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
      `select u.id, u.username, u.email, u.email_verified_at, u.role, u.password_hash, u.created_at, u.updated_at
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
      `select id, username, email, email_verified_at, role, password_hash, created_at, updated_at
       from platform_users
       where lower(username) = lower($1)
       limit 1`,
      [normalizedUsername]
    );

    return result.rows[0] ? toPublicDatabaseUser(result.rows[0]) : undefined;
  }

  async listUsers(): Promise<PublicUser[]> {
    await this.ensureSchema();
    const result = await this.pool.query<DatabaseUserRow>(
      `select id, username, email, email_verified_at, role, password_hash, created_at, updated_at
       from platform_users
       order by lower(username)`
    );

    return result.rows.map(toPublicDatabaseUser);
  }

  async changePassword(token: string, currentPassword: string, newPassword: string): Promise<PublicUser> {
    assertPassword(newPassword);
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from auth_sessions where expires_at <= now()");
      const result = await client.query<DatabaseUserRow>(
        `select u.id, u.username, u.email, u.email_verified_at, u.role, u.password_hash, u.created_at, u.updated_at
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

      return toPublicDatabaseUser({
        ...user,
        password_hash: passwordHash,
        updated_at: updatedAt
      });
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteAccount(token: string, password: string): Promise<void> {
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from auth_sessions where expires_at <= now()");
      const result = await client.query<DatabaseUserRow>(
        `select u.id, u.username, u.email, u.email_verified_at, u.role, u.password_hash, u.created_at, u.updated_at
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
      if (!verifyPassword(password, user.password_hash)) {
        throw new Error("Current password is incorrect");
      }

      const adminCount = await client.query<{ count: string }>(
        "select count(*)::text as count from platform_users where role = 'admin'"
      );
      assertCanDeleteUser(
        {
          id: user.id,
          username: user.username,
          email: user.email,
          emailVerified: Boolean(user.email_verified_at),
          role: user.role,
          createdAt: "",
          updatedAt: ""
        },
        [],
        Number(adminCount.rows[0]?.count ?? 0)
      );

      await client.query("delete from platform_users where id = $1", [user.id]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createEmailVerificationToken(userId: string, expiresMs: number): Promise<string> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const userResult = await client.query<{ id: string; email: string | null; email_verified_at: AuthDatabaseTimestamp | null }>(
        `select id, email, email_verified_at
         from platform_users
         where id = $1
         for update`,
        [userId]
      );
      const user = userResult.rows[0];
      if (!user) {
        throw new Error("User not found");
      }
      if (user.email_verified_at) {
        throw new Error("Email already verified");
      }
      if (!user.email) {
        throw new Error("User email is missing");
      }

      const rawToken = `ev_${randomBytes(32).toString("base64url")}`;
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + expiresMs).toISOString();
      await client.query("delete from email_verification_tokens where user_id = $1", [userId]);
      await client.query(
        `insert into email_verification_tokens (id, user_id, token_hash, expires_at, created_at)
         values ($1, $2, $3, $4, $5)`,
        [randomUUID(), userId, hashToken(rawToken), expiresAt, now]
      );
      await client.query("commit");
      return rawToken;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async verifyEmail(token: string): Promise<PublicUser> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from email_verification_tokens where expires_at <= now()");
      const tokenResult = await client.query<{ user_id: string }>(
        `select user_id
         from email_verification_tokens
         where token_hash = $1 and expires_at > now()
         limit 1
         for update`,
        [hashToken(token.trim())]
      );
      const tokenRow = tokenResult.rows[0];
      if (!tokenRow) {
        throw new Error("Invalid or expired verification token");
      }

      const now = new Date().toISOString();
      await client.query(
        `update platform_users
         set email_verified_at = $1, updated_at = $1
         where id = $2`,
        [now, tokenRow.user_id]
      );
      await client.query("delete from email_verification_tokens where user_id = $1", [tokenRow.user_id]);

      const userResult = await client.query<DatabaseUserRow>(
        `select id, username, email, email_verified_at, role, password_hash, created_at, updated_at
         from platform_users
         where id = $1`,
        [tokenRow.user_id]
      );
      const user = userResult.rows[0];
      if (!user) {
        throw new Error("User not found");
      }

      await client.query("commit");
      return toPublicDatabaseUser(user);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async resendEmailVerification(
    username: string,
    password: string,
    expiresMs: number
  ): Promise<{ user: PublicUser; token: string }> {
    const user = await this.validateUnverifiedUserForVerification(username, password);
    const token = await this.createEmailVerificationToken(user.id, expiresMs);
    return { user, token };
  }

  async validateUnverifiedUserForVerification(username: string, password: string): Promise<PublicUser> {
    const normalizedUsername = normalizeUsername(username);
    await this.ensureSchema();
    const result = await this.pool.query<DatabaseUserRow>(
      `select id, username, email, email_verified_at, role, password_hash, created_at, updated_at
       from platform_users
       where lower(username) = lower($1)
       limit 1`,
      [normalizedUsername]
    );
    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new Error("Invalid username or password");
    }
    if (user.email_verified_at) {
      throw new Error("Email already verified");
    }
    if (!user.email) {
      throw new Error("User email is missing");
    }

    return toPublicDatabaseUser(user);
  }

  async purgeExpiredUnverifiedUsers(retentionDays: number): Promise<number> {
    if (retentionDays <= 0) {
      return 0;
    }

    await this.ensureSchema();
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    const result = await this.pool.query<{ id: string }>(
      `with admin_totals as (
         select count(*)::int as total from platform_users where role = 'admin'
       )
       delete from platform_users u
       where u.email_verified_at is null
         and u.created_at <= $1
         and not (
           u.role = 'admin'
           and (select total from admin_totals) = 1
         )
       returning u.id`,
      [cutoff]
    );

    return result.rowCount ?? result.rows.length;
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
          `insert into platform_users (id, username, email, email_verified_at, role, password_hash, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (id) do nothing`,
          [
            user.id,
            user.username,
            user.email ?? null,
            user.emailVerifiedAt ?? user.createdAt,
            user.role,
            user.passwordHash,
            user.createdAt,
            user.updatedAt
          ]
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

  private async migrateEmailColumn(client: pg.PoolClient): Promise<void> {
    const migrationName = "auth-add-email-v1";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    await client.query(`alter table platform_users add column if not exists email text`);
    await client.query(
      `create unique index if not exists platform_users_email_lower_key
       on platform_users (lower(email))
       where email is not null`
    );

    await client.query(
      `insert into platform_schema_migrations (name, applied_at)
       values ($1, now())
       on conflict (name) do nothing`,
      [migrationName]
    );
  }

  private async migrateEmailVerification(client: pg.PoolClient): Promise<void> {
    const migrationName = "auth-email-verification-v1";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    await client.query(`alter table platform_users add column if not exists email_verified_at timestamptz`);
    await client.query(
      `update platform_users
       set email_verified_at = coalesce(email_verified_at, created_at)
       where email_verified_at is null`
    );
    await client.query(`
      create table if not exists email_verification_tokens (
        id text primary key,
        user_id text not null references platform_users(id) on delete cascade,
        token_hash text not null unique,
        expires_at timestamptz not null,
        created_at timestamptz not null
      )
    `);
    await client.query(
      `create index if not exists email_verification_tokens_user_id_idx
       on email_verification_tokens (user_id)`
    );
    await client.query(
      `create index if not exists email_verification_tokens_expires_at_idx
       on email_verification_tokens (expires_at)`
    );

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
        await this.migrateEmailColumn(client);
        await this.migrateEmailVerification(client);
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

/**
 * Resolve a login identifier that may be either a username or an email address.
 * Returns the trimmed raw value for lookup; format violations surface as
 * "Invalid username" so the login endpoint never leaks validation details.
 */
function resolveLoginIdentifier(identifier: string): { raw: string } {
  const raw = identifier.trim();
  try {
    if (raw.includes("@")) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        throw new Error("Invalid username");
      }
    } else {
      normalizeUsername(raw);
    }
  } catch {
    throw new Error("Invalid username");
  }
  return { raw };
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Invalid email address");
  }
  return normalized;
}

function assertPassword(password: string): void {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
}

function assertCanDeleteUser(user: PublicUser, users: PublicUser[], adminCount?: number): void {
  if (user.role !== "admin") {
    return;
  }

  const totalAdmins = adminCount ?? users.filter((item) => item.role === "admin").length;
  if (totalAdmins <= 1) {
    throw new Error("Cannot delete the last administrator account");
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
  const emailVerifiedAt = user.emailVerifiedAt ?? null;
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    emailVerified: emailVerifiedAt !== null,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function toPublicDatabaseUser(user: DatabaseUserRow): PublicUser {
  const emailVerifiedAt = user.email_verified_at ? toAuthIsoString(user.email_verified_at) : null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: emailVerifiedAt !== null,
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
  const users: Record<string, StoredUser> = {};
  for (const [id, user] of Object.entries(data.users ?? {})) {
    const emailVerifiedAt =
      user.emailVerifiedAt !== undefined
        ? user.emailVerifiedAt
        : user.emailVerified === false
          ? null
          : user.createdAt ?? null;
    users[id] = {
      ...user,
      email: user.email ?? null,
      emailVerifiedAt,
      emailVerified: emailVerifiedAt !== null
    };
  }

  return {
    users,
    sessions: data.sessions ?? {}
  };
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
