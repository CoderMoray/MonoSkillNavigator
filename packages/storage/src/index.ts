import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import * as Minio from "minio";
import pg from "pg";
import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import type { ReviewReport, ReviewVerdict } from "@skill-platform/review-engine";
import { readSkillZipBuffer, skillSnapshotToZipBuffer, type SkillManifest, type SkillSnapshot } from "@skill-platform/skill-spec";

export * from "./auth";

export type ContributorRole = "owner" | "maintainer" | "reviewer" | "contributor";
export type IssueType = "bug" | "security" | "compatibility" | "feature" | "docs";
export type IssueStatus = "open" | "triaged" | "closed";
export type IssueSeverity = "low" | "medium" | "high" | "critical";
export type LeaderboardSort = "downloads" | "rating" | "quality" | "security" | "functional" | "recent";
export type ArtifactProvider = "minio";

export interface ArtifactDescriptor {
  provider: ArtifactProvider;
  bucket: string;
  objectKey: string;
  contentHash: string;
  size: number;
  storedAt: string;
}

export interface ArtifactStore {
  putSnapshot(name: string, version: string, snapshot: SkillSnapshot): Promise<ArtifactDescriptor>;
  getSnapshot(descriptor: ArtifactDescriptor): Promise<SkillSnapshot>;
}

export interface RegistryContributor {
  id: string;
  userId?: string;
  username?: string;
  name: string;
  role: ContributorRole;
  addedAt: string;
}

export interface RegistryIssue {
  id: string;
  type: IssueType;
  status: IssueStatus;
  severity: IssueSeverity;
  title: string;
  body?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryRating {
  id: string;
  version?: string;
  user: string;
  score: number;
  comment?: string;
  createdAt: string;
}

export interface RegistryVersion {
  version: string;
  manifest: SkillManifest;
  contentHash: string;
  snapshot: SkillSnapshot;
  artifact?: ArtifactDescriptor;
  review: ReviewReport;
  evaluation?: FunctionalEvaluationReport;
  status: ReviewVerdict;
  downloads: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrySkill {
  name: string;
  description: string;
  ownerUserId?: string;
  latestVersion: string;
  versions: Record<string, RegistryVersion>;
  contributors: RegistryContributor[];
  issues: RegistryIssue[];
  ratings: RegistryRating[];
  averageRating: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryData {
  skills: Record<string, RegistrySkill>;
}

export interface SkillSearchResult {
  name: string;
  description: string;
  latestVersion: string;
  status: ReviewVerdict;
  scores: ReviewReport["scores"];
  averageRating: number;
  ratingCount: number;
  openIssues: number;
  contributors: RegistryContributor[];
  downloads: number;
  updatedAt: string;
}

export interface CreateIssueInput {
  type: IssueType;
  severity?: IssueSeverity;
  title: string;
  body?: string;
  createdBy?: string;
}

export interface CreateRatingInput {
  version?: string;
  user: string;
  score: number;
  comment?: string;
}

export interface PublishSnapshotOptions {
  owner?: {
    userId: string;
    username: string;
  };
}

export interface PostgresRegistryStoreOptions {
  artifactStore?: ArtifactStore;
  pool?: pg.Pool;
}

export interface FileRegistryStoreOptions {
  artifactStore?: ArtifactStore;
}

export interface MinioArtifactStoreOptions {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
}

export interface RegistryStore {
  publishSnapshot(
    snapshot: SkillSnapshot,
    review: ReviewReport,
    evaluation?: FunctionalEvaluationReport,
    options?: PublishSnapshotOptions
  ): Promise<RegistryVersion>;
  upsertReview(name: string, version: string, review: ReviewReport): Promise<RegistryVersion>;
  upsertEvaluation(name: string, version: string, evaluation: FunctionalEvaluationReport): Promise<RegistryVersion>;
  addContributor(name: string, contributor: Omit<RegistryContributor, "id" | "addedAt">): Promise<RegistryContributor>;
  createIssue(name: string, issue: CreateIssueInput): Promise<RegistryIssue>;
  listIssues(name: string, status?: IssueStatus): Promise<RegistryIssue[]>;
  addRating(name: string, rating: CreateRatingInput): Promise<RegistryRating>;
  search(query?: string): Promise<SkillSearchResult[]>;
  getSkill(name: string): Promise<RegistrySkill | undefined>;
  getVersion(name: string, version?: string): Promise<RegistryVersion | undefined>;
  leaderboard(sort?: LeaderboardSort, limit?: number): Promise<SkillSearchResult[]>;
  downloadSnapshot(name: string, version?: string): Promise<SkillSnapshot | undefined>;
  reviewAll(
    reviewFn: (snapshot: SkillSnapshot, version: string) => ReviewReport,
    evaluationFn?: (snapshot: SkillSnapshot) => FunctionalEvaluationReport
  ): Promise<RegistryVersion[]>;
}

const emptyRegistry: RegistryData = {
  skills: {}
};

abstract class JsonRegistryStore implements RegistryStore {
  protected constructor(protected readonly artifactStore?: ArtifactStore) {}

  async publishSnapshot(
    snapshot: SkillSnapshot,
    review: ReviewReport,
    evaluation?: FunctionalEvaluationReport,
    options: PublishSnapshotOptions = {}
  ): Promise<RegistryVersion> {
    const data = await this.load();
    const name = snapshot.manifest.name;
    const version = review.version;
    const now = new Date().toISOString();
    const existingSkill = data.skills[name];

    if (existingSkill?.versions[version]) {
      throw new Error(`Version already exists: ${name}@${version}`);
    }

    const artifact = await this.artifactStore?.putSnapshot(name, version, snapshot);
    const registryVersion: RegistryVersion = {
      version,
      manifest: snapshot.manifest,
      contentHash: snapshot.contentHash,
      snapshot,
      artifact,
      review,
      evaluation,
      status: review.verdict,
      downloads: 0,
      createdAt: now,
      updatedAt: now
    };

    const ownerContributor = createOwnerContributor(snapshot, now, options);
    const contributors = existingSkill?.contributors ?? [ownerContributor];
    if (existingSkill && options.owner && !existingSkill.ownerUserId && !contributors.some((item) => matchesContributorUser(item, options.owner!.userId, options.owner!.username))) {
      contributors.push(ownerContributor);
    }

    data.skills[name] = {
      name,
      description: snapshot.manifest.description,
      ownerUserId: existingSkill?.ownerUserId ?? options.owner?.userId,
      latestVersion: version,
      versions: {
        ...(existingSkill?.versions ?? {}),
        [version]: registryVersion
      },
      contributors,
      issues: existingSkill?.issues ?? [],
      ratings: existingSkill?.ratings ?? [],
      averageRating: existingSkill?.averageRating ?? 0,
      ratingCount: existingSkill?.ratingCount ?? 0,
      createdAt: existingSkill?.createdAt ?? now,
      updatedAt: now
    };

    await this.save(data);
    return registryVersion;
  }

  async upsertReview(name: string, version: string, review: ReviewReport): Promise<RegistryVersion> {
    const data = await this.load();
    const registryVersion = data.skills[name]?.versions[version];

    if (!registryVersion) {
      throw new Error(`Version not found: ${name}@${version}`);
    }

    registryVersion.review = review;
    registryVersion.status = review.verdict;
    registryVersion.updatedAt = new Date().toISOString();
    data.skills[name]!.updatedAt = registryVersion.updatedAt;

    await this.save(data);
    return registryVersion;
  }

  async upsertEvaluation(
    name: string,
    version: string,
    evaluation: FunctionalEvaluationReport
  ): Promise<RegistryVersion> {
    const data = await this.load();
    const registryVersion = data.skills[name]?.versions[version];

    if (!registryVersion) {
      throw new Error(`Version not found: ${name}@${version}`);
    }

    registryVersion.evaluation = evaluation;
    registryVersion.updatedAt = new Date().toISOString();
    data.skills[name]!.updatedAt = registryVersion.updatedAt;

    await this.save(data);
    return registryVersion;
  }

  async addContributor(
    name: string,
    contributor: Omit<RegistryContributor, "id" | "addedAt">
  ): Promise<RegistryContributor> {
    const data = await this.load();
    const skill = data.skills[name];
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }

    const existing = skill.contributors.find((item) => item.name.toLowerCase() === contributor.name.toLowerCase());
    const now = new Date().toISOString();

    if (existing) {
      existing.role = contributor.role;
      skill.updatedAt = now;
      await this.save(data);
      return existing;
    }

    const created: RegistryContributor = {
      id: createId("contributor"),
      ...contributor,
      addedAt: now
    };
    skill.contributors.push(created);
    skill.updatedAt = now;

    await this.save(data);
    return created;
  }

  async createIssue(name: string, issue: CreateIssueInput): Promise<RegistryIssue> {
    const data = await this.load();
    const skill = data.skills[name];
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }

    const now = new Date().toISOString();
    const created: RegistryIssue = {
      id: createId("issue"),
      type: issue.type,
      status: "open",
      severity: issue.severity ?? "medium",
      title: issue.title,
      body: issue.body,
      createdBy: issue.createdBy,
      createdAt: now,
      updatedAt: now
    };
    skill.issues.push(created);
    skill.updatedAt = now;

    await this.save(data);
    return created;
  }

  async listIssues(name: string, status?: IssueStatus): Promise<RegistryIssue[]> {
    const data = await this.load();
    const issues = data.skills[name]?.issues ?? [];
    return status ? issues.filter((issue) => issue.status === status) : issues;
  }

  async addRating(name: string, rating: CreateRatingInput): Promise<RegistryRating> {
    if (rating.score < 1 || rating.score > 5) {
      throw new Error("Rating score must be between 1 and 5");
    }

    const data = await this.load();
    const skill = data.skills[name];
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }

    const created: RegistryRating = {
      id: createId("rating"),
      version: rating.version,
      user: rating.user,
      score: rating.score,
      comment: rating.comment,
      createdAt: new Date().toISOString()
    };
    skill.ratings.push(created);
    updateRatingAggregate(skill);
    skill.updatedAt = created.createdAt;

    await this.save(data);
    return created;
  }

  async search(query = ""): Promise<SkillSearchResult[]> {
    const data = await this.load();
    const normalizedQuery = query.trim().toLowerCase();

    return Object.values(data.skills)
      .filter((skill) => {
        if (!normalizedQuery) {
          return true;
        }
        return (
          skill.name.toLowerCase().includes(normalizedQuery) ||
          skill.description.toLowerCase().includes(normalizedQuery)
        );
      })
      .map((skill) => toSearchResult(skill))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSkill(name: string): Promise<RegistrySkill | undefined> {
    const data = await this.load();
    return data.skills[name];
  }

  async getVersion(name: string, version = "latest"): Promise<RegistryVersion | undefined> {
    const data = await this.load();
    const skill = data.skills[name];
    if (!skill) {
      return undefined;
    }

    const resolvedVersion = version === "latest" ? skill.latestVersion : version;
    return skill.versions[resolvedVersion];
  }

  async leaderboard(sort: LeaderboardSort = "downloads", limit = 20): Promise<SkillSearchResult[]> {
    const items = await this.search();

    return items
      .sort((a, b) => {
        switch (sort) {
          case "rating":
            return b.averageRating - a.averageRating || b.ratingCount - a.ratingCount;
          case "quality":
            return b.scores.qualityScore - a.scores.qualityScore;
          case "security":
            return b.scores.securityScore - a.scores.securityScore;
          case "functional":
            return b.scores.functionalScore - a.scores.functionalScore;
          case "recent":
            return b.updatedAt.localeCompare(a.updatedAt);
          case "downloads":
            return b.downloads - a.downloads;
        }
      })
      .slice(0, Math.max(1, Math.min(limit, 100)));
  }

  async downloadSnapshot(name: string, version = "latest"): Promise<SkillSnapshot | undefined> {
    const data = await this.load();
    const skill = data.skills[name];
    if (!skill) {
      return undefined;
    }

    const resolvedVersion = version === "latest" ? skill.latestVersion : version;
    const registryVersion = skill.versions[resolvedVersion];
    if (!registryVersion) {
      return undefined;
    }

    const snapshot =
      registryVersion.artifact && this.artifactStore
        ? await this.artifactStore.getSnapshot(registryVersion.artifact)
        : registryVersion.snapshot;

    registryVersion.downloads += 1;
    registryVersion.updatedAt = new Date().toISOString();
    await this.save(data);
    return snapshot;
  }

  async reviewAll(
    reviewFn: (snapshot: SkillSnapshot, version: string) => ReviewReport,
    evaluationFn?: (snapshot: SkillSnapshot) => FunctionalEvaluationReport
  ): Promise<RegistryVersion[]> {
    const data = await this.load();
    const reviewed: RegistryVersion[] = [];

    for (const skill of Object.values(data.skills)) {
      for (const registryVersion of Object.values(skill.versions)) {
        const snapshot =
          registryVersion.artifact && this.artifactStore
            ? await this.artifactStore.getSnapshot(registryVersion.artifact)
            : registryVersion.snapshot;
        const review = reviewFn(snapshot, registryVersion.version);
        registryVersion.snapshot = snapshot;
        registryVersion.review = review;
        registryVersion.evaluation = evaluationFn?.(snapshot) ?? registryVersion.evaluation;
        registryVersion.status = review.verdict;
        registryVersion.updatedAt = new Date().toISOString();
        reviewed.push(registryVersion);
      }
      skill.updatedAt = new Date().toISOString();
    }

    await this.save(data);
    return reviewed;
  }

  protected abstract load(): Promise<RegistryData>;
  protected abstract save(data: RegistryData): Promise<void>;
}

export class FileRegistryStore extends JsonRegistryStore {
  private readonly registryPath: string;

  constructor(dataDir = ".data", options: FileRegistryStoreOptions = {}) {
    super(options.artifactStore);
    const baseDir = path.isAbsolute(dataDir) ? "" : process.env.INIT_CWD ?? process.cwd();
    this.registryPath = path.join(path.resolve(baseDir, dataDir), "registry.json");
  }

  protected async load(): Promise<RegistryData> {
    try {
      const raw = await readFile(this.registryPath, "utf8");
      return normalizeRegistryData(JSON.parse(raw) as RegistryData);
    } catch (error) {
      if (isNotFoundError(error)) {
        return structuredClone(emptyRegistry);
      }
      throw error;
    }
  }

  protected async save(data: RegistryData): Promise<void> {
    await mkdir(path.dirname(this.registryPath), { recursive: true });
    const tempPath = `${this.registryPath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tempPath, this.registryPath);
  }
}

export class PostgresRegistryStore extends JsonRegistryStore {
  private readonly pool: pg.Pool;
  private schemaReady?: Promise<void>;

  constructor(databaseUrl: string, options: PostgresRegistryStoreOptions = {}) {
    super(options.artifactStore);
    this.pool = options.pool ?? new pg.Pool({ connectionString: databaseUrl });
  }

  protected async load(): Promise<RegistryData> {
    await this.ensureSchema();
    const result = await this.pool.query<{ name: string; document: RegistrySkill }>(
      "select name, document from registry_skills order by updated_at desc"
    );
    const skills: Record<string, RegistrySkill> = {};

    for (const row of result.rows) {
      skills[row.name] = row.document;
    }

    return normalizeRegistryData({ skills });
  }

  protected async save(data: RegistryData): Promise<void> {
    await this.ensureSchema();
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const names = Object.keys(data.skills);

      for (const skill of Object.values(data.skills)) {
        await client.query(
          `insert into registry_skills (name, document, created_at, updated_at)
           values ($1, $2::jsonb, $3, $4)
           on conflict (name)
           do update set document = excluded.document, updated_at = excluded.updated_at`,
          [skill.name, JSON.stringify(skill), skill.createdAt, skill.updatedAt]
        );
      }

      if (names.length === 0) {
        await client.query("delete from registry_skills");
      } else {
        await client.query("delete from registry_skills where not (name = any($1::text[]))", [names]);
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private ensureSchema(): Promise<void> {
    this.schemaReady ??= this.pool
      .query(`
        create table if not exists registry_skills (
          name text primary key,
          document jsonb not null,
          created_at timestamptz not null,
          updated_at timestamptz not null
        );

        create index if not exists registry_skills_updated_at_idx
          on registry_skills (updated_at desc);
      `)
      .then(() => undefined)
      .catch((error) => {
        this.schemaReady = undefined;
        throw error;
      });

    return this.schemaReady;
  }
}

export class MinioArtifactStore implements ArtifactStore {
  private readonly client: Minio.Client;
  private bucketReady?: Promise<void>;

  constructor(private readonly options: MinioArtifactStoreOptions) {
    this.client = new Minio.Client({
      endPoint: options.endPoint,
      port: options.port,
      useSSL: options.useSSL,
      accessKey: options.accessKey,
      secretKey: options.secretKey
    });
  }

  async putSnapshot(name: string, version: string, snapshot: SkillSnapshot): Promise<ArtifactDescriptor> {
    await this.ensureBucket();
    const body = skillSnapshotToZipBuffer(snapshot);
    const objectKey = `${safeObjectSegment(name)}/${safeObjectSegment(version)}/${snapshot.contentHash}.zip`;

    await this.client.putObject(this.options.bucket, objectKey, body, body.length, {
      "content-type": "application/zip",
      "x-amz-meta-content-hash": snapshot.contentHash
    });

    return {
      provider: "minio",
      bucket: this.options.bucket,
      objectKey,
      contentHash: snapshot.contentHash,
      size: body.length,
      storedAt: new Date().toISOString()
    };
  }

  async getSnapshot(descriptor: ArtifactDescriptor): Promise<SkillSnapshot> {
    const stream = await this.client.getObject(descriptor.bucket, descriptor.objectKey);
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const body = Buffer.concat(chunks);
    if (descriptor.objectKey.toLowerCase().endsWith(".zip")) {
      return readSkillZipBuffer(body);
    }

    return JSON.parse(body.toString("utf8")) as SkillSnapshot;
  }

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      const exists = await this.client.bucketExists(this.options.bucket);
      if (!exists) {
        await this.client.makeBucket(this.options.bucket, this.options.region ?? "us-east-1");
      }
    })();

    return this.bucketReady;
  }
}

export function createRegistryStoreFromEnv(env: NodeJS.ProcessEnv = process.env): RegistryStore {
  const artifactStore = createArtifactStoreFromEnv(env);
  const storeType = env.REGISTRY_STORE ?? (env.DATABASE_URL ? "postgres" : "file");

  if (storeType === "postgres") {
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when REGISTRY_STORE=postgres");
    }
    return new PostgresRegistryStore(env.DATABASE_URL, { artifactStore });
  }

  return new FileRegistryStore(env.DATA_DIR ?? ".data", { artifactStore });
}

export function loadDotEnvIfPresent(filePath = ".env"): void {
  const absolutePath = path.resolve(process.env.INIT_CWD ?? process.cwd(), filePath);
  if (existsSync(absolutePath)) {
    loadEnvFile(absolutePath);
  }
}

export function createArtifactStoreFromEnv(env: NodeJS.ProcessEnv = process.env): ArtifactStore | undefined {
  if (env.MINIO_ENABLED !== "true") {
    return undefined;
  }

  return new MinioArtifactStore({
    endPoint: env.MINIO_ENDPOINT ?? "127.0.0.1",
    port: Number(env.MINIO_PORT ?? 9000),
    useSSL: env.MINIO_USE_SSL === "true",
    accessKey: env.MINIO_ACCESS_KEY ?? "skill_platform",
    secretKey: env.MINIO_SECRET_KEY ?? "skill_platform_secret",
    bucket: env.MINIO_BUCKET ?? "skill-artifacts",
    region: env.MINIO_REGION
  });
}

function toSearchResult(skill: RegistrySkill): SkillSearchResult {
  const latest = skill.versions[skill.latestVersion];
  if (!latest) {
    throw new Error(`Registry is corrupt: missing latest version for ${skill.name}`);
  }

  return {
    name: skill.name,
    description: skill.description,
    latestVersion: skill.latestVersion,
    status: latest.status,
    scores: latest.review.scores,
    averageRating: skill.averageRating,
    ratingCount: skill.ratingCount,
    openIssues: skill.issues.filter((issue) => issue.status !== "closed").length,
    contributors: skill.contributors,
    downloads: Object.values(skill.versions).reduce((total, version) => total + version.downloads, 0),
    updatedAt: skill.updatedAt
  };
}

export function isSkillContributor(skill: RegistrySkill, user: { id: string; username: string; role?: string }): boolean {
  if (user.role === "admin") {
    return true;
  }

  if (skill.ownerUserId && skill.ownerUserId === user.id) {
    return true;
  }

  return skill.contributors.some((contributor) => matchesContributorUser(contributor, user.id, user.username));
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function normalizeRegistryData(data: RegistryData): RegistryData {
  for (const skill of Object.values(data.skills ?? {})) {
    skill.ownerUserId ??= skill.contributors?.find((contributor) => contributor.role === "owner")?.userId;
    skill.contributors ??= [];
    skill.issues ??= [];
    skill.ratings ??= [];
    skill.ratingCount ??= skill.ratings.length;
    skill.averageRating ??= calculateAverageRating(skill.ratings);
    updateRatingAggregate(skill);

    for (const version of Object.values(skill.versions ?? {})) {
      version.downloads ??= 0;
    }
  }

  return {
    skills: data.skills ?? {}
  };
}

function updateRatingAggregate(skill: RegistrySkill): void {
  skill.ratingCount = skill.ratings.length;
  skill.averageRating = calculateAverageRating(skill.ratings);
}

function calculateAverageRating(ratings: RegistryRating[]): number {
  if (ratings.length === 0) {
    return 0;
  }

  const total = ratings.reduce((sum, rating) => sum + rating.score, 0);
  return Math.round((total / ratings.length) * 10) / 10;
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createOwnerContributor(
  snapshot: SkillSnapshot,
  addedAt: string,
  options: PublishSnapshotOptions
): RegistryContributor {
  if (options.owner) {
    return {
      id: createId("contributor"),
      userId: options.owner.userId,
      username: options.owner.username,
      name: options.owner.username,
      role: "owner",
      addedAt
    };
  }

  return {
    id: createId("contributor"),
    name: snapshot.manifest.author ?? "unknown",
    role: "owner",
    addedAt
  };
}

function matchesContributorUser(contributor: RegistryContributor, userId: string, username: string): boolean {
  return (
    contributor.userId === userId ||
    contributor.username?.toLowerCase() === username.toLowerCase() ||
    contributor.name.toLowerCase() === username.toLowerCase()
  );
}

function safeObjectSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
