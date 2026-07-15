import type { FunctionalEvaluationFinding, FunctionalEvaluationReport, FunctionalEvaluationTaskResult } from "@skill-platform/evaluator";
import type { ReviewFinding, ReviewReport, ReviewVerdict } from "@skill-platform/review-engine";
import { getSkillSlug, type SkillManifest, type SkillSnapshot } from "@skill-platform/skill-spec";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, sql, desc, or, ilike, inArray, sum, count } from "drizzle-orm";
import pg from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../schema";
import type {
  ArtifactDescriptor,
  ArtifactProvider,
  ArtifactStore,
  ContributorRole,
  IssueSeverity,
  IssueStatus,
  IssueType,
  PostgresRegistryStoreOptions,
  RegistryContributor,
  RegistryData,
  RegistryIssue,
  RegistryRating,
  RegistrySkill,
  RegistryVersion,
  SkillSearchResult,
  LeaderboardSort,
} from "../types";
import { emptyRegistry, normalizeRegistryData, toSearchResult } from "../utils";
import { JsonRegistryStore } from "./base";

type DB = NodePgDatabase<typeof schema>;

function toIsoString(value: string | Date | number | null | undefined): string {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

function createArtifactDescriptor(row: {
  artifact_provider: string | null;
  artifact_bucket: string | null;
  artifact_object_key: string | null;
  artifact_content_hash: string | null;
  artifact_size: number | string | null;
  artifact_stored_at: string | Date | null;
}): ArtifactDescriptor | undefined {
  if (!row.artifact_provider) return undefined;
  return {
    provider: row.artifact_provider as ArtifactDescriptor["provider"],
    bucket: row.artifact_bucket!,
    objectKey: row.artifact_object_key!,
    contentHash: row.artifact_content_hash!,
    size: toNumber(row.artifact_size),
    storedAt: toIsoString(row.artifact_stored_at),
  };
}

type DatabaseTimestamp = Date | string;


interface DatabaseSkillRow {
  slug: string;
  name: string;
  description: string;
  owner_user_id: string | null;
  latest_version: string;
  average_rating: number | string;
  rating_count: number | string;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
}

interface DatabaseVersionRow {
  skill_slug: string;
  version: string;
  manifest_name: string;
  manifest_description: string;
  manifest_version: string | null;
  manifest_author: string | null;
  manifest_license: string | null;
  tags_defined: boolean;
  supported_agents: string[];
  supported_agents_defined: boolean;
  allowed_tools: string[];
  allowed_tools_defined: boolean;
  allowed_tools_is_scalar: boolean;
  disallowed_tools: string[];
  disallowed_tools_defined: boolean;
  disallowed_tools_is_scalar: boolean;
  categories: string[];
  topics: string[];
  release_tags: string[];
  content_hash: string;
  readme: string;
  snapshot_created_at: DatabaseTimestamp;
  status: ReviewVerdict;
  downloads: number | string;
  artifact_provider: string | null;
  artifact_bucket: string | null;
  artifact_object_key: string | null;
  artifact_content_hash: string | null;
  artifact_size: number | string | null;
  artifact_stored_at: DatabaseTimestamp | null;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
}

interface DatabaseManifestPropertyRow {
  property_key: string;
  value_kind: string;
  value_text: string | null;
}

interface DatabaseFileRow {
  path: string;
  content: string;
  size: number | string;
  sha256: string;
}

interface DatabaseReviewRow {
  review_id: string;
  report_version: string;
  content_hash: string;
  verdict: ReviewVerdict;
  quality_score: number | string;
  security_score: number | string;
  privacy_score: number | string;
  functional_score: number | string;
  overall_score: number | string;
  created_at: DatabaseTimestamp;
}

interface DatabaseReviewFindingRow {
  finding_id: string;
  category: ReviewFinding["category"];
  severity: ReviewFinding["severity"];
  title: string;
  message: string;
  path: string | null;
  evidence: string | null;
  recommendation: string;
}

interface DatabaseEvaluationRow {
  evaluation_id: string;
  provider: FunctionalEvaluationReport["provider"];
  status: FunctionalEvaluationReport["status"];
  score: number | string;
  tasks_total: number | string;
  tasks_passed: number | string;
  created_at: DatabaseTimestamp;
}

interface DatabaseEvaluationTaskRow {
  task_position: number | string;
  name: string;
  score: number | string;
}

interface DatabaseEvaluationFindingRow {
  task_position?: number | string;
  finding_id: string;
  task_name: string | null;
  severity: FunctionalEvaluationFinding["severity"];
  message: string;
  recommendation: string;
}

interface DatabaseContributorRow {
  id: string;
  user_id: string | null;
  username: string | null;
  name: string;
  role: ContributorRole;
  added_at: DatabaseTimestamp;
}

interface DatabaseIssueRow {
  id: string;
  type: IssueType;
  status: IssueStatus;
  severity: IssueSeverity;
  title: string;
  body: string | null;
  created_by: string | null;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
}

interface DatabaseRatingRow {
  id: string;
  version: string | null;
  user_name: string;
  score: number | string;
  comment: string | null;
  created_at: DatabaseTimestamp;
}

export class PostgresRegistryStore extends JsonRegistryStore {
  private readonly pool: pg.Pool;
  private db!: DB;
  private schemaReady?: Promise<void>;

  constructor(databaseUrl: string, options: PostgresRegistryStoreOptions = {}) {
    super(options.artifactStore);
    this.pool = new pg.Pool({ connectionString: databaseUrl });
    this.db = drizzle(this.pool, { schema });
  }

  // --- 高频读操作：直接 Drizzle 查询，不走 load/save ---

  async search(query = ""): Promise<SkillSearchResult[]> {
    await this.ensureSchema();
    const q = query.trim();
    const searchPattern = q ? `%${q}%` : "%";

    const rows = await this.db
      .select({
        slug: schema.skills.slug,
        name: schema.skills.name,
        description: schema.skills.description,
        latestVersion: schema.skills.latestVersion,
        status: schema.skillVersions.status,
        qualityScore: schema.skillReviews.qualityScore,
        securityScore: schema.skillReviews.securityScore,
        privacyScore: schema.skillReviews.privacyScore,
        functionalScore: schema.skillReviews.functionalScore,
        overallScore: schema.skillReviews.overallScore,
        averageRating: schema.skills.averageRating,
        ratingCount: schema.skills.ratingCount,
        totalDownloads: sql<number>`coalesce(sum(${schema.skillVersions.downloads}), 0)`.mapWith(Number),
        updatedAt: schema.skills.updatedAt,
        openIssues: sql<number>`(
          select count(*) from ${schema.skillIssues}
          where ${schema.skillIssues.skillSlug} = ${schema.skills.slug}
          and ${schema.skillIssues.status} != 'closed'
        )`.mapWith(Number),
      })
      .from(schema.skills)
      .innerJoin(
        schema.skillVersions,
        and(
          eq(schema.skillVersions.skillSlug, schema.skills.slug),
          eq(schema.skillVersions.version, schema.skills.latestVersion)
        )
      )
      .innerJoin(
        schema.skillReviews,
        and(
          eq(schema.skillReviews.skillSlug, schema.skills.slug),
          eq(schema.skillReviews.version, schema.skills.latestVersion)
        )
      )
      .where(
        q
          ? or(
              ilike(schema.skills.slug, searchPattern),
              ilike(schema.skills.name, searchPattern),
              ilike(schema.skills.description, searchPattern)
            )
          : undefined
      )
      .groupBy(
        schema.skills.slug, schema.skills.name, schema.skills.description,
        schema.skills.latestVersion, schema.skillVersions.status,
        schema.skillReviews.qualityScore, schema.skillReviews.securityScore,
        schema.skillReviews.privacyScore, schema.skillReviews.functionalScore,
        schema.skillReviews.overallScore, schema.skills.averageRating,
        schema.skills.ratingCount, schema.skills.updatedAt
      )
      .orderBy(desc(schema.skills.updatedAt));

    const slugs = rows.map((r) => r.slug);
    if (slugs.length === 0) return [];

    // 批量查 contributors
    const allContributors = await this.db
      .select()
      .from(schema.skillContributors)
      .where(inArray(schema.skillContributors.skillSlug, slugs));

    const contributorsMap = new Map<string, SkillSearchResult["contributors"]>();
    for (const c of allContributors) {
      const list = contributorsMap.get(c.skillSlug) ?? [];
      list.push({
        id: c.id,
        userId: c.userId ?? undefined,
        username: c.username ?? undefined,
        name: c.name,
        role: c.role as SkillSearchResult["contributors"][number]["role"],
        addedAt: String(c.addedAt),
      });
      contributorsMap.set(c.skillSlug, list);
    }

    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      latestVersion: r.latestVersion,
      status: r.status as SkillSearchResult["status"],
      scores: {
        qualityScore: Number(r.qualityScore),
        securityScore: Number(r.securityScore),
        privacyScore: Number(r.privacyScore),
        functionalScore: Number(r.functionalScore),
        overallScore: Number(r.overallScore),
      },
      averageRating: Number(r.averageRating),
      ratingCount: Number(r.ratingCount),
      openIssues: r.openIssues,
      contributors: contributorsMap.get(r.slug) ?? [],
      downloads: r.totalDownloads,
      updatedAt: String(r.updatedAt),
    }));
  }

  async getSkill(slug: string): Promise<RegistrySkill | undefined> {
    await this.ensureSchema();
    const [row] = await this.db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.slug, slug))
      .limit(1);

    if (!row) return undefined;

    const versions = await this.db
      .select()
      .from(schema.skillVersions)
      .where(eq(schema.skillVersions.skillSlug, slug))
      .orderBy(schema.skillVersions.createdAt);

    const contributors = await this.db
      .select()
      .from(schema.skillContributors)
      .where(eq(schema.skillContributors.skillSlug, slug));

    const issues = await this.db
      .select()
      .from(schema.skillIssues)
      .where(eq(schema.skillIssues.skillSlug, slug));

    const ratings = await this.db
      .select()
      .from(schema.skillRatings)
      .where(eq(schema.skillRatings.skillSlug, slug));

    // Load each version's details
    const versionMap: Record<string, RegistryVersion> = {};
    for (const v of versions) {
      const tags = await this.db.select({ tag: schema.skillVersionTags.tag })
        .from(schema.skillVersionTags)
        .where(and(eq(schema.skillVersionTags.skillSlug, slug), eq(schema.skillVersionTags.version, v.version)))
        .orderBy(schema.skillVersionTags.position);

      const files = await this.db.select()
        .from(schema.skillVersionFiles)
        .where(and(eq(schema.skillVersionFiles.skillSlug, slug), eq(schema.skillVersionFiles.version, v.version)))
        .orderBy(schema.skillVersionFiles.path);

      const [review] = await this.db.select()
        .from(schema.skillReviews)
        .where(and(eq(schema.skillReviews.skillSlug, slug), eq(schema.skillReviews.version, v.version)));

      const findings = review
        ? await this.db.select().from(schema.skillReviewFindings)
            .where(and(eq(schema.skillReviewFindings.skillSlug, slug), eq(schema.skillReviewFindings.version, v.version)))
            .orderBy(schema.skillReviewFindings.position)
        : [];

      versionMap[v.version] = {
        version: v.version,
        manifest: {
          slug, name: v.manifestName, description: v.manifestDescription,
          version: v.manifestVersion ?? undefined,
          author: v.manifestAuthor ?? undefined,
          license: v.manifestLicense ?? undefined,
          tags: tags.map((t) => t.tag),
          ...(v.supportedAgentsDefined ? { supportedAgents: v.supportedAgents } : {}),
          ...(v.allowedToolsDefined ? { "allowed-tools": v.allowedToolsIsScalar ? v.allowedTools[0] : v.allowedTools } : {}),
          ...(v.disallowedToolsDefined ? { "disallowed-tools": v.disallowedToolsIsScalar ? v.disallowedTools[0] : v.disallowedTools } : {}),
          categories: v.categories, topics: v.topics,
          "release-tags": v.releaseTags,
        } as RegistryVersion["manifest"],
        contentHash: v.contentHash,
        snapshot: {
          manifest: {} as RegistryVersion["manifest"],
          readme: v.readme,
          files: files.map((f) => ({ path: f.path, content: f.content, size: f.size, sha256: f.sha256 })),
          contentHash: v.contentHash, createdAt: String(v.snapshotCreatedAt),
        },
        artifact: v.artifactProvider ? {
          provider: v.artifactProvider as "minio", bucket: v.artifactBucket!,
          objectKey: v.artifactObjectKey!, contentHash: v.artifactContentHash!,
          size: Number(v.artifactSize ?? 0), storedAt: String(v.artifactStoredAt ?? ""),
        } : undefined,
        review: review ? {
          id: review.reviewId, skillSlug: slug, skillName: v.manifestName,
          version: review.reportVersion, contentHash: review.contentHash,
          verdict: review.verdict as RegistryVersion["status"],
          scores: {
            qualityScore: Number(review.qualityScore), securityScore: Number(review.securityScore),
            privacyScore: Number(review.privacyScore), functionalScore: Number(review.functionalScore),
            overallScore: Number(review.overallScore),
          },
          findings: findings.map((f) => ({
            id: f.findingId, category: f.category as any, severity: f.severity as any,
            title: f.title, message: f.message, path: f.path ?? undefined,
            evidence: f.evidence ?? undefined, recommendation: f.recommendation,
          })),
          createdAt: String(review.createdAt),
        } : {} as RegistryVersion["review"],
        status: v.status as RegistryVersion["status"],
        releaseTags: v.releaseTags, downloads: Number(v.downloads),
        createdAt: String(v.createdAt), updatedAt: String(v.updatedAt),
      };
    }

    return {
      slug: row.slug, name: row.name, description: row.description,
      ownerUserId: row.ownerUserId ?? undefined, latestVersion: row.latestVersion,
      versions: versionMap,
      contributors: contributors.map((c) => ({
        id: c.id, userId: c.userId ?? undefined, username: c.username ?? undefined,
        name: c.name, role: c.role as any, addedAt: String(c.addedAt),
      })),
      issues: issues.map((i) => ({
        id: i.id, type: i.type as any, status: i.status as any,
        severity: i.severity as any, title: i.title, body: i.body ?? undefined,
        createdBy: i.createdBy ?? undefined, createdAt: String(i.createdAt), updatedAt: String(i.updatedAt),
      })),
      ratings: ratings.map((r) => ({
        id: r.id, version: r.version ?? undefined, user: r.userName,
        score: r.score, comment: r.comment ?? undefined, createdAt: String(r.createdAt),
      })),
      averageRating: Number(row.averageRating), ratingCount: Number(row.ratingCount),
      createdAt: String(row.createdAt), updatedAt: String(row.updatedAt),
    };
  }

  // --- 写操作：增量 Drizzle，不走 load/save ---

  async addRating(slug: string, rating: { version?: string; user: string; score: number; comment?: string }): Promise<RegistryRating> {
    await this.ensureSchema();
    if (rating.score < 1 || rating.score > 5) throw new Error("Rating score must be between 1 and 5");

    const id = `rating_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date();

    await this.db.insert(schema.skillRatings).values({
      id, skillSlug: slug, version: rating.version ?? null,
      userName: rating.user, score: rating.score, comment: rating.comment ?? null, createdAt,
    });

    const [agg] = await this.db
      .select({
        count: sql<number>`cast(count(*) as integer)`.mapWith(Number),
        avg: sql<number>`round(avg(${schema.skillRatings.score})::numeric, 1)`.mapWith(Number),
      })
      .from(schema.skillRatings)
      .where(eq(schema.skillRatings.skillSlug, slug));

    const now = new Date();
    await this.db.update(schema.skills)
      .set({ averageRating: String(agg?.avg ?? 0), ratingCount: agg?.count ?? 0, updatedAt: now })
      .where(eq(schema.skills.slug, slug));

    return { id, version: rating.version, user: rating.user, score: rating.score, comment: rating.comment, createdAt: createdAt.toISOString() };
  }

  async createIssue(slug: string, issue: { type: string; severity?: string; title: string; body?: string; createdBy?: string }): Promise<RegistryIssue> {
    await this.ensureSchema();
    const id = `issue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date();

    await this.db.insert(schema.skillIssues).values({
      id, skillSlug: slug,
      type: issue.type as any, status: "open" as any, severity: (issue.severity ?? "medium") as any,
      title: issue.title, body: issue.body ?? null, createdBy: issue.createdBy ?? null,
      createdAt, updatedAt: createdAt,
    });

    return {
      id, type: issue.type as any, status: "open" as any, severity: (issue.severity ?? "medium") as any,
      title: issue.title, body: issue.body, createdBy: issue.createdBy,
      createdAt: createdAt.toISOString(), updatedAt: createdAt.toISOString(),
    };
  }

  async addContributor(slug: string, contributor: { userId?: string; username?: string; name: string; role: string }): Promise<RegistryContributor> {
    await this.ensureSchema();
    const addedAt = new Date();
    const id = `contributor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const [existing] = await this.db.select()
      .from(schema.skillContributors)
      .where(and(eq(schema.skillContributors.skillSlug, slug), eq(schema.skillContributors.name, contributor.name)))
      .limit(1);

    if (existing) {
      await this.db.update(schema.skillContributors)
        .set({ role: contributor.role as any })
        .where(eq(schema.skillContributors.id, existing.id));
      return {
        id: existing.id, userId: existing.userId ?? undefined, username: existing.username ?? undefined,
        name: existing.name, role: contributor.role as any, addedAt: String(existing.addedAt),
      };
    }

    await this.db.insert(schema.skillContributors).values({
      id, skillSlug: slug, userId: contributor.userId ?? null,
      username: contributor.username ?? null, name: contributor.name,
      role: contributor.role as any, addedAt,
    });

    return { id, userId: contributor.userId, username: contributor.username, name: contributor.name, role: contributor.role as any, addedAt: addedAt.toISOString() };
  }

  async downloadSnapshot(slug: string, version = "latest"): Promise<any | undefined> {
    await this.ensureSchema();
    const resolved = version === "latest"
      ? (await this.db.select({ v: schema.skills.latestVersion }).from(schema.skills).where(eq(schema.skills.slug, slug)).limit(1))[0]?.v
      : version;
    if (!resolved) return undefined;

    const [v] = await this.db.select()
      .from(schema.skillVersions)
      .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, resolved)))
      .limit(1);
    if (!v) return undefined;

    await this.db.update(schema.skillVersions)
      .set({ downloads: sql`${schema.skillVersions.downloads} + 1`, updatedAt: new Date() })
      .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, resolved)));

    if (v.artifactProvider && this.artifactStore) {
      return this.artifactStore.getSnapshot({
        provider: v.artifactProvider as "minio", bucket: v.artifactBucket!,
        objectKey: v.artifactObjectKey!, contentHash: v.artifactContentHash!,
        size: Number(v.artifactSize ?? 0), storedAt: String(v.artifactStoredAt ?? ""),
      });
    }

    const files = await this.db.select()
      .from(schema.skillVersionFiles)
      .where(and(eq(schema.skillVersionFiles.skillSlug, slug), eq(schema.skillVersionFiles.version, resolved)))
      .orderBy(schema.skillVersionFiles.path);

    const tags = await this.db.select({ tag: schema.skillVersionTags.tag })
      .from(schema.skillVersionTags)
      .where(and(eq(schema.skillVersionTags.skillSlug, slug), eq(schema.skillVersionTags.version, resolved)))
      .orderBy(schema.skillVersionTags.position);

    return {
      manifest: { slug, name: v.manifestName, description: v.manifestDescription, tags: tags.map((t) => t.tag), categories: v.categories, topics: v.topics },
      readme: v.readme,
      files: files.map((f) => ({ path: f.path, content: f.content, size: f.size, sha256: f.sha256 })),
      contentHash: v.contentHash, createdAt: String(v.snapshotCreatedAt),
    };
  }

  async upsertReview(slug: string, version: string, review: any): Promise<RegistryVersion> {
    await this.ensureSchema();
    const createdAt = new Date();

    await this.db.insert(schema.skillReviews).values({
      skillSlug: slug, version, reviewId: review.id, reportVersion: review.version ?? "1.0",
      contentHash: review.contentHash ?? "", verdict: review.verdict,
      qualityScore: review.scores.qualityScore, securityScore: review.scores.securityScore,
      privacyScore: review.scores.privacyScore, functionalScore: review.scores.functionalScore,
      overallScore: review.scores.overallScore, createdAt,
    }).onConflictDoUpdate({
      target: [schema.skillReviews.skillSlug, schema.skillReviews.version],
      set: {
        reviewId: review.id, reportVersion: review.version ?? "1.0",
        contentHash: review.contentHash ?? "", verdict: review.verdict,
        qualityScore: review.scores.qualityScore, securityScore: review.scores.securityScore,
        privacyScore: review.scores.privacyScore, functionalScore: review.scores.functionalScore,
        overallScore: review.scores.overallScore,
      },
    });

    // Delete old findings and re-insert
    await this.db.delete(schema.skillReviewFindings)
      .where(and(eq(schema.skillReviewFindings.skillSlug, slug), eq(schema.skillReviewFindings.version, version)));

    if (review.findings?.length) {
      await this.db.insert(schema.skillReviewFindings).values(
        review.findings.map((f: any, i: number) => ({
          skillSlug: slug, version, position: i,
          findingId: f.id ?? `finding_${i}`,
          category: f.category, severity: f.severity,
          title: f.title, message: f.message,
          path: f.path ?? null, evidence: f.evidence ?? null,
          recommendation: f.recommendation,
        }))
      );
    }

    await this.db.update(schema.skillVersions)
      .set({ status: review.verdict, updatedAt: new Date() })
      .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, version)));

    return (await this.getSkill(slug))?.versions[version]!;
  }

  async upsertEvaluation(slug: string, version: string, evaluation: any): Promise<RegistryVersion> {
    await this.ensureSchema();
    const createdAt = new Date();

    await this.db.insert(schema.skillEvaluations).values({
      skillSlug: slug, version, evaluationId: evaluation.id,
      provider: evaluation.provider, status: evaluation.status,
      score: evaluation.score, tasksTotal: evaluation.tasksTotal ?? evaluation.tasks_total ?? 0,
      tasksPassed: evaluation.tasksPassed ?? evaluation.tasks_passed ?? 0, createdAt,
    }).onConflictDoUpdate({
      target: [schema.skillEvaluations.skillSlug, schema.skillEvaluations.version],
      set: {
        evaluationId: evaluation.id, provider: evaluation.provider,
        status: evaluation.status, score: evaluation.score,
        tasksTotal: evaluation.tasksTotal ?? evaluation.tasks_total ?? 0,
        tasksPassed: evaluation.tasksPassed ?? evaluation.tasks_passed ?? 0,
      },
    });

    return (await this.getSkill(slug))?.versions[version]!;
  }

  async publishSnapshot(snapshot: any, review: any, evaluation?: any, options: any = {}): Promise<RegistryVersion> {
    await this.ensureSchema();
    const slug = (snapshot.manifest as any).slug || getSkillSlug(snapshot.manifest);
    const version = review.version;
    const now = new Date();
    const releaseTags = options.releaseTags ?? (snapshot.manifest as any)["release-tags"] ?? ["latest"];
    const name = (snapshot.manifest as any).name;
    const description = (snapshot.manifest as any).description ?? "";

    // Check version conflict
    const [existingV] = await this.db.select()
      .from(schema.skillVersions).where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, version))).limit(1);
    if (existingV) throw new Error(`Version already exists: ${slug}@${version}`);

    const [existingSkill] = await this.db.select().from(schema.skills).where(eq(schema.skills.slug, slug)).limit(1);
    if (!existingSkill && !releaseTags.includes("latest")) throw new Error("First version must include latest tag");

    // Artifact to MinIO
    const artifact = !!(this as any).artifactStore
      ? await ((this as any).artifactStore as ArtifactStore).putSnapshot(slug, version, snapshot)
      : undefined;

    await this.db.transaction(async (tx) => {
      if (existingSkill) {
        await tx.update(schema.skills)
          .set({ latestVersion: releaseTags.includes("latest") ? version : existingSkill.latestVersion, updatedAt: now })
          .where(eq(schema.skills.slug, slug));
      } else {
        await tx.insert(schema.skills).values({
          slug, name, description, ownerUserId: options.owner?.userId ?? null,
          latestVersion: version, createdAt: now, updatedAt: now,
        });
      }

      if (releaseTags.includes("latest")) {
        const oldLatest = await tx.select({ v: schema.skillVersions.version, tags: schema.skillVersions.releaseTags })
          .from(schema.skillVersions)
          .where(eq(schema.skillVersions.skillSlug, slug));
        for (const ov of oldLatest) {
          if (ov.tags.includes("latest")) {
            await tx.update(schema.skillVersions)
              .set({ releaseTags: ov.tags.filter((t: string) => t !== "latest") })
              .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, ov.v)));
          }
        }
      }

      await tx.insert(schema.skillVersions).values({
        skillSlug: slug, version, status: review.verdict,
        manifestName: name, manifestDescription: description,
        manifestVersion: snapshot.manifest.version ?? null,
        manifestAuthor: snapshot.manifest.author ?? null,
        manifestLicense: snapshot.manifest.license ?? null,
        tagsDefined: !!snapshot.manifest.tags?.length,
        categories: snapshot.manifest.categories ?? [], topics: snapshot.manifest.topics ?? [],
        releaseTags, contentHash: snapshot.contentHash, readme: snapshot.readme ?? "",
        snapshotCreatedAt: now, createdAt: now, updatedAt: now,
      });

      if (snapshot.manifest.tags?.length) {
        await tx.insert(schema.skillVersionTags).values(
          snapshot.manifest.tags.map((tag: string, i: number) => ({ skillSlug: slug, version, position: i, tag }))
        );
      }

      if (snapshot.files?.length) {
        await tx.insert(schema.skillVersionFiles).values(
          snapshot.files.map((f: any) => ({ skillSlug: slug, version, path: f.path, content: f.content, size: f.size, sha256: f.sha256 }))
        );
      }

      await tx.insert(schema.skillReviews).values({
        skillSlug: slug, version, reviewId: review.id ?? `review_${Date.now()}`,
        reportVersion: review.version ?? "1.0", contentHash: review.contentHash ?? "",
        verdict: review.verdict,
        qualityScore: review.scores.qualityScore, securityScore: review.scores.securityScore,
        privacyScore: review.scores.privacyScore, functionalScore: review.scores.functionalScore,
        overallScore: review.scores.overallScore, createdAt: now,
      });

      if (review.findings?.length) {
        await tx.insert(schema.skillReviewFindings).values(
          review.findings.map((f: any, i: number) => ({
            skillSlug: slug, version, position: i, findingId: f.id ?? `finding_${i}`,
            category: f.category, severity: f.severity, title: f.title, message: f.message,
            path: f.path ?? null, evidence: f.evidence ?? null, recommendation: f.recommendation,
          }))
        );
      }

      if (evaluation) {
        await tx.insert(schema.skillEvaluations).values({
          skillSlug: slug, version, evaluationId: evaluation.id,
          provider: evaluation.provider, status: evaluation.status,
          score: evaluation.score, tasksTotal: evaluation.tasksTotal ?? 0,
          tasksPassed: evaluation.tasksPassed ?? 0, createdAt: now,
        });
      }

      const ownerName = options.owner?.username ?? snapshot.manifest.author ?? "unknown";
      const [existingC] = await tx.select()
        .from(schema.skillContributors)
        .where(and(eq(schema.skillContributors.skillSlug, slug), eq(schema.skillContributors.name, ownerName)))
        .limit(1);
      if (!existingC) {
        await tx.insert(schema.skillContributors).values({
          id: `contributor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          skillSlug: slug, userId: options.owner?.userId ?? null,
          username: options.owner?.username ?? null, name: ownerName, role: "owner", addedAt: now,
        });
      }
    });

    return (await this.getSkill(slug))?.versions[version]!;
  }

  async reviewAll(reviewFn: any, evaluationFn?: any): Promise<RegistryVersion[]> {
    await this.ensureSchema();
    const versions = await this.db
      .select({ slug: schema.skillVersions.skillSlug, version: schema.skillVersions.version })
      .from(schema.skillVersions);

    const results: RegistryVersion[] = [];
    for (const { slug, version } of versions) {
      const skill = await this.getSkill(slug);
      const rv = skill?.versions[version];
      if (!rv) continue;

      const review = reviewFn(rv.snapshot, version);
      await this.upsertReview(slug, version, review);

      if (evaluationFn) {
        const evaluation = evaluationFn(rv.snapshot);
        await this.upsertEvaluation(slug, version, evaluation);
      }

      results.push((await this.getSkill(slug))!.versions[version]!);
    }
    return results;
  }

  async listIssues(slug: string, status?: string): Promise<any[]> {
    await this.ensureSchema();
    const rows = await this.db.select()
      .from(schema.skillIssues)
      .where(eq(schema.skillIssues.skillSlug, slug))
      .orderBy(schema.skillIssues.createdAt);

    return rows
      .filter((i) => !status || i.status === status)
      .map((i) => ({
        id: i.id, type: i.type, status: i.status, severity: i.severity,
        title: i.title, body: i.body ?? undefined, createdBy: i.createdBy ?? undefined,
        createdAt: String(i.createdAt), updatedAt: String(i.updatedAt),
      }));
  }

  async getVersion(slug: string, ver = "latest"): Promise<RegistryVersion | undefined> {
    const skill = await this.getSkill(slug);
    if (!skill) return undefined;
    const resolved = ver === "latest" ? skill.latestVersion : ver;
    return skill.versions[resolved];
  }

  protected async load(): Promise<RegistryData> {
    await this.ensureSchema();
    const client = await this.pool.connect();

    try {
      const result = await client.query<DatabaseSkillRow>(
        `select slug, name, description, owner_user_id, latest_version, average_rating, rating_count, created_at, updated_at
         from skills
         order by updated_at desc`
      );
      const skills: Record<string, RegistrySkill> = {};

      for (const row of result.rows) {
        const skill = await this.readSkill(client, row);
        skills[skill.slug] = skill;
      }

      return normalizeRegistryData({ skills });
    } finally {
      client.release();
    }
  }

  protected async save(data: RegistryData): Promise<void> {
    await this.ensureSchema();
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      await this.replaceRegistryData(client, normalizeRegistryData(data));
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async readSkill(client: pg.PoolClient, row: DatabaseSkillRow): Promise<RegistrySkill> {
    const versionsResult = await client.query<DatabaseVersionRow>(
      `select *
       from skill_versions
       where skill_slug = $1
       order by created_at asc, version asc`,
      [row.slug]
    );
    const contributorsResult = await client.query<DatabaseContributorRow>(
      `select id, user_id, username, name, role, added_at
       from skill_contributors
       where skill_slug = $1
       order by added_at asc, id asc`,
      [row.slug]
    );
    const issuesResult = await client.query<DatabaseIssueRow>(
      `select id, type, status, severity, title, body, created_by, created_at, updated_at
       from skill_issues
       where skill_slug = $1
       order by created_at asc, id asc`,
      [row.slug]
    );
    const ratingsResult = await client.query<DatabaseRatingRow>(
      `select id, version, user_name, score, comment, created_at
       from skill_ratings
       where skill_slug = $1
       order by created_at asc, id asc`,
      [row.slug]
    );

    const versions: Record<string, RegistryVersion> = {};
    for (const versionRow of versionsResult.rows) {
      const version = await this.readVersion(client, versionRow);
      versions[version.version] = version;
    }

    return {
      slug: row.slug,
      name: row.name,
      description: row.description,
      ownerUserId: row.owner_user_id ?? undefined,
      latestVersion: row.latest_version,
      versions,
      contributors: contributorsResult.rows.map((contributor) => ({
        id: contributor.id,
        userId: contributor.user_id ?? undefined,
        username: contributor.username ?? undefined,
        name: contributor.name,
        role: contributor.role,
        addedAt: toIsoString(contributor.added_at)
      })),
      issues: issuesResult.rows.map((issue) => ({
        id: issue.id,
        type: issue.type,
        status: issue.status,
        severity: issue.severity,
        title: issue.title,
        body: issue.body ?? undefined,
        createdBy: issue.created_by ?? undefined,
        createdAt: toIsoString(issue.created_at),
        updatedAt: toIsoString(issue.updated_at)
      })),
      ratings: ratingsResult.rows.map((rating) => ({
        id: rating.id,
        version: rating.version ?? undefined,
        user: rating.user_name,
        score: toNumber(rating.score),
        comment: rating.comment ?? undefined,
        createdAt: toIsoString(rating.created_at)
      })),
      averageRating: toNumber(row.average_rating),
      ratingCount: toNumber(row.rating_count),
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at)
    };
  }

  private async readVersion(client: pg.PoolClient, row: DatabaseVersionRow): Promise<RegistryVersion> {
    const tagsResult = await client.query<{ tag: string }>(
      `select tag
       from skill_version_tags
       where skill_slug = $1 and version = $2
       order by position asc`,
      [row.skill_slug, row.version]
    );
    const propertiesResult = await client.query<DatabaseManifestPropertyRow>(
      `select property_key, value_kind, value_text
       from skill_version_manifest_properties
       where skill_slug = $1 and version = $2
       order by property_key asc`,
      [row.skill_slug, row.version]
    );
    const filesResult = await client.query<DatabaseFileRow>(
      `select path, content, size, sha256
       from skill_version_files
       where skill_slug = $1 and version = $2
       order by path asc`,
      [row.skill_slug, row.version]
    );
    const reviewResult = await client.query<DatabaseReviewRow>(
      `select review_id, report_version, content_hash, verdict, quality_score, security_score,
              privacy_score, functional_score, overall_score, created_at
       from skill_reviews
       where skill_slug = $1 and version = $2`,
      [row.skill_slug, row.version]
    );
    const reviewFindingsResult = await client.query<DatabaseReviewFindingRow>(
      `select finding_id, category, severity, title, message, path, evidence, recommendation
       from skill_review_findings
       where skill_slug = $1 and version = $2
       order by position asc`,
      [row.skill_slug, row.version]
    );
    const evaluationResult = await client.query<DatabaseEvaluationRow>(
      `select evaluation_id, provider, status, score, tasks_total, tasks_passed, created_at
       from skill_evaluations
       where skill_slug = $1 and version = $2`,
      [row.skill_slug, row.version]
    );

    const reviewRow = reviewResult.rows[0];
    if (!reviewRow) {
      throw new Error(`Registry is corrupt: missing review for ${row.skill_slug}@${row.version}`);
    }

    const evaluation = evaluationResult.rows[0]
      ? await this.readEvaluation(client, row.skill_slug, row.version, evaluationResult.rows[0])
      : undefined;
    const manifest = createManifestFromRow(row, tagsResult.rows.map((item) => item.tag), propertiesResult.rows);

    return {
      version: row.version,
      manifest,
      contentHash: row.content_hash,
      snapshot: {
        manifest,
        readme: row.readme,
        files: filesResult.rows.map((file) => ({
          path: file.path,
          content: file.content,
          size: toNumber(file.size),
          sha256: file.sha256
        })),
        contentHash: row.content_hash,
        createdAt: toIsoString(row.snapshot_created_at)
      },
      artifact: createArtifactDescriptor(row),
      review: {
        id: reviewRow.review_id,
        skillSlug: row.skill_slug,
        skillName: manifest.name,
        version: reviewRow.report_version,
        contentHash: reviewRow.content_hash,
        verdict: reviewRow.verdict,
        scores: {
          qualityScore: toNumber(reviewRow.quality_score),
          securityScore: toNumber(reviewRow.security_score),
          privacyScore: toNumber(reviewRow.privacy_score),
          functionalScore: toNumber(reviewRow.functional_score),
          overallScore: toNumber(reviewRow.overall_score)
        },
        findings: reviewFindingsResult.rows.map((finding) => ({
          id: finding.finding_id,
          category: finding.category,
          severity: finding.severity,
          title: finding.title,
          message: finding.message,
          path: finding.path ?? undefined,
          evidence: finding.evidence ?? undefined,
          recommendation: finding.recommendation
        })),
        createdAt: toIsoString(reviewRow.created_at)
      },
      evaluation,
      status: row.status,
      releaseTags: row.release_tags ?? [],
      downloads: toNumber(row.downloads),
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at)
    };
  }

  private async readEvaluation(
    client: pg.PoolClient,
    skillSlug: string,
    version: string,
    row: DatabaseEvaluationRow
  ): Promise<FunctionalEvaluationReport> {
    const tasksResult = await client.query<DatabaseEvaluationTaskRow>(
      `select task_position, name, score
       from skill_evaluation_tasks
       where skill_slug = $1 and version = $2
       order by task_position asc`,
      [skillSlug, version]
    );
    const reportFindingsResult = await client.query<DatabaseEvaluationFindingRow>(
      `select finding_id, task_name, severity, message, recommendation
       from skill_evaluation_report_findings
       where skill_slug = $1 and version = $2
       order by position asc`,
      [skillSlug, version]
    );
    const taskFindingsResult = await client.query<DatabaseEvaluationFindingRow>(
      `select task_position, finding_id, task_name, severity, message, recommendation
       from skill_evaluation_task_findings
       where skill_slug = $1 and version = $2
       order by task_position asc, position asc`,
      [skillSlug, version]
    );

    const taskFindings = new Map<number, FunctionalEvaluationFinding[]>();
    for (const finding of taskFindingsResult.rows) {
      const taskPosition = toNumber(finding.task_position ?? 0);
      const current = taskFindings.get(taskPosition) ?? [];
      current.push(toFunctionalFinding(finding));
      taskFindings.set(taskPosition, current);
    }

    const taskResults: FunctionalEvaluationTaskResult[] = tasksResult.rows.map((task) => ({
      name: task.name,
      score: toNumber(task.score),
      findings: taskFindings.get(toNumber(task.task_position)) ?? []
    }));

    return {
      id: row.evaluation_id,
      provider: row.provider,
      status: row.status,
      score: toNumber(row.score),
      tasksTotal: toNumber(row.tasks_total),
      tasksPassed: toNumber(row.tasks_passed),
      taskResults,
      findings: reportFindingsResult.rows.map(toFunctionalFinding),
      createdAt: toIsoString(row.created_at)
    };
  }

  private async replaceRegistryData(client: pg.PoolClient, data: RegistryData): Promise<void> {
    const skills = Object.values(data.skills);
    const slugs = skills.map((skill) => skill.slug);

    if (slugs.length === 0) {
      await client.query("delete from skills");
      return;
    }

    await client.query("delete from skills where not (slug = any($1::text[]))", [slugs]);

    for (const skill of skills) {
      await this.writeSkill(client, skill);
    }
  }

  private async writeSkill(client: pg.PoolClient, skill: RegistrySkill): Promise<void> {
    await client.query(
      `insert into skills (
         slug, name, description, owner_user_id, latest_version, average_rating, rating_count, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (slug) do update set
         name = excluded.name,
         description = excluded.description,
         owner_user_id = excluded.owner_user_id,
         latest_version = excluded.latest_version,
         average_rating = excluded.average_rating,
         rating_count = excluded.rating_count,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
      [
        skill.slug,
        skill.name,
        skill.description,
        skill.ownerUserId ?? null,
        skill.latestVersion,
        skill.averageRating,
        skill.ratingCount,
        skill.createdAt,
        skill.updatedAt
      ]
    );

    await client.query("delete from skill_contributors where skill_slug = $1", [skill.slug]);
    await client.query("delete from skill_issues where skill_slug = $1", [skill.slug]);
    await client.query("delete from skill_ratings where skill_slug = $1", [skill.slug]);
    await client.query("delete from skill_versions where skill_slug = $1", [skill.slug]);

    for (const contributor of skill.contributors) {
      await client.query(
        `insert into skill_contributors (id, skill_slug, user_id, username, name, role, added_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          contributor.id,
          skill.slug,
          contributor.userId ?? null,
          contributor.username ?? null,
          contributor.name,
          contributor.role,
          contributor.addedAt
        ]
      );
    }

    for (const issue of skill.issues) {
      await client.query(
        `insert into skill_issues (
           id, skill_slug, type, status, severity, title, body, created_by, created_at, updated_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          issue.id,
          skill.slug,
          issue.type,
          issue.status,
          issue.severity,
          issue.title,
          issue.body ?? null,
          issue.createdBy ?? null,
          issue.createdAt,
          issue.updatedAt
        ]
      );
    }

    for (const rating of skill.ratings) {
      await client.query(
        `insert into skill_ratings (id, skill_slug, version, user_name, score, comment, created_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [rating.id, skill.slug, rating.version ?? null, rating.user, rating.score, rating.comment ?? null, rating.createdAt]
      );
    }

    for (const version of Object.values(skill.versions)) {
      await this.writeVersion(client, skill.slug, version);
    }
  }

  private async writeVersion(client: pg.PoolClient, skillSlug: string, version: RegistryVersion): Promise<void> {
    const manifestFields = getManifestFields(version.manifest);
    const artifact = version.artifact;

    await client.query(
      `insert into skill_versions (
         skill_slug, version, manifest_name, manifest_description, manifest_version, manifest_author, manifest_license,
         tags_defined, supported_agents, supported_agents_defined,
         allowed_tools, allowed_tools_defined, allowed_tools_is_scalar,
         disallowed_tools, disallowed_tools_defined, disallowed_tools_is_scalar,
         categories, topics, release_tags,
         content_hash, readme, snapshot_created_at, status, downloads,
         artifact_provider, artifact_bucket, artifact_object_key, artifact_content_hash, artifact_size, artifact_stored_at,
         created_at, updated_at
       )
       values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
         $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
       )`,
      [
        skillSlug,
        version.version,
        version.manifest.name,
        version.manifest.description,
        manifestFields.version,
        manifestFields.author,
        manifestFields.license,
        manifestFields.tagsDefined,
        manifestFields.supportedAgents.values,
        manifestFields.supportedAgents.defined,
        manifestFields.allowedTools.values,
        manifestFields.allowedTools.defined,
        manifestFields.allowedTools.isScalar,
        manifestFields.disallowedTools.values,
        manifestFields.disallowedTools.defined,
        manifestFields.disallowedTools.isScalar,
        version.manifest.categories ?? [],
        version.manifest.topics ?? [],
        version.releaseTags,
        version.contentHash,
        version.snapshot.readme,
        version.snapshot.createdAt,
        version.status,
        version.downloads,
        artifact?.provider ?? null,
        artifact?.bucket ?? null,
        artifact?.objectKey ?? null,
        artifact?.contentHash ?? null,
        artifact?.size ?? null,
        artifact?.storedAt ?? null,
        version.createdAt,
        version.updatedAt
      ]
    );

    for (const [position, tag] of (version.manifest.tags ?? []).entries()) {
      await client.query(
        `insert into skill_version_tags (skill_slug, version, position, tag)
         values ($1, $2, $3, $4)`,
        [skillSlug, version.version, position, tag]
      );
    }

    for (const property of getManifestProperties(version.manifest)) {
      await client.query(
        `insert into skill_version_manifest_properties (
           skill_slug, version, property_key, value_kind, value_text
         )
         values ($1, $2, $3, $4, $5)`,
        [skillSlug, version.version, property.key, property.kind, property.value]
      );
    }

    for (const file of version.snapshot.files) {
      await client.query(
        `insert into skill_version_files (skill_slug, version, path, content, size, sha256)
         values ($1, $2, $3, $4, $5, $6)`,
        [skillSlug, version.version, file.path, file.content, file.size, file.sha256]
      );
    }

    await client.query(
      `insert into skill_reviews (
         skill_slug, version, review_id, report_version, content_hash, verdict,
         quality_score, security_score, privacy_score, functional_score, overall_score, created_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        skillSlug,
        version.version,
        version.review.id,
        version.review.version,
        version.review.contentHash,
        version.review.verdict,
        version.review.scores.qualityScore,
        version.review.scores.securityScore,
        version.review.scores.privacyScore,
        version.review.scores.functionalScore,
        version.review.scores.overallScore,
        version.review.createdAt
      ]
    );

    for (const [position, finding] of version.review.findings.entries()) {
      await client.query(
        `insert into skill_review_findings (
           skill_slug, version, position, finding_id, category, severity, title, message, path, evidence, recommendation
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          skillSlug,
          version.version,
          position,
          finding.id,
          finding.category,
          finding.severity,
          finding.title,
          finding.message,
          finding.path ?? null,
          finding.evidence ?? null,
          finding.recommendation
        ]
      );
    }

    if (version.evaluation) {
      await this.writeEvaluation(client, skillSlug, version.version, version.evaluation);
    }
  }

  private async writeEvaluation(
    client: pg.PoolClient,
    skillSlug: string,
    version: string,
    evaluation: FunctionalEvaluationReport
  ): Promise<void> {
    await client.query(
      `insert into skill_evaluations (
         skill_slug, version, evaluation_id, provider, status, score, tasks_total, tasks_passed, created_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        skillSlug,
        version,
        evaluation.id,
        evaluation.provider,
        evaluation.status,
        evaluation.score,
        evaluation.tasksTotal,
        evaluation.tasksPassed,
        evaluation.createdAt
      ]
    );

    for (const [position, finding] of evaluation.findings.entries()) {
      await client.query(
        `insert into skill_evaluation_report_findings (
           skill_slug, version, position, finding_id, task_name, severity, message, recommendation
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          skillSlug,
          version,
          position,
          finding.id,
          finding.task ?? null,
          finding.severity,
          finding.message,
          finding.recommendation
        ]
      );
    }

    for (const [taskPosition, task] of evaluation.taskResults.entries()) {
      await client.query(
        `insert into skill_evaluation_tasks (skill_slug, version, task_position, name, score)
         values ($1, $2, $3, $4, $5)`,
        [skillSlug, version, taskPosition, task.name, task.score]
      );

      for (const [position, finding] of task.findings.entries()) {
        await client.query(
          `insert into skill_evaluation_task_findings (
             skill_slug, version, task_position, position, finding_id, task_name, severity, message, recommendation
           )
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            skillSlug,
            version,
            taskPosition,
            position,
            finding.id,
            finding.task ?? null,
            finding.severity,
            finding.message,
            finding.recommendation
          ]
        );
      }
    }
  }

  private async migrateLegacyRegistry(client: pg.PoolClient): Promise<void> {
    const migrationName = "registry-json-to-relational-v1";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    const existing = await client.query<{ count: string }>("select count(*)::text as count from skills");
    const legacyTable = await client.query<{ table_name: string | null }>(
      "select to_regclass('public.registry_skills') as table_name"
    );

    if (toNumber(existing.rows[0]?.count ?? 0) === 0 && legacyTable.rows[0]?.table_name) {
      const legacy = await client.query<{ name: string; document: RegistrySkill }>(
        "select name, document from registry_skills order by updated_at asc"
      );
      const skills: Record<string, RegistrySkill> = {};
      for (const row of legacy.rows) {
        skills[row.name] = row.document;
      }
      await this.replaceRegistryData(client, normalizeRegistryData({ skills }));
    }

    await client.query(
      `insert into platform_schema_migrations (name, applied_at)
       values ($1, now())
       on conflict (name) do nothing`,
      [migrationName]
    );
  }

  private async migrateSlugIdentity(client: pg.PoolClient): Promise<void> {
    const migrationName = "registry-slug-identity-v2";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    const skillColumns = await client.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_schema = 'public' and table_name = 'skills'`
    );
    const skillColumnNames = new Set(skillColumns.rows.map((row) => row.column_name));

    if (!skillColumnNames.has("slug")) {
      await client.query(`
        alter table skills rename column name to slug;
        alter table skills add column name text;
        update skills set name = slug where name is null;
        alter table skills alter column name set not null;

        alter table skill_versions rename column skill_name to skill_slug;
        alter table skill_version_tags rename column skill_name to skill_slug;
        alter table skill_version_manifest_properties rename column skill_name to skill_slug;
        alter table skill_version_files rename column skill_name to skill_slug;
        alter table skill_reviews rename column skill_name to skill_slug;
        alter table skill_review_findings rename column skill_name to skill_slug;
        alter table skill_evaluations rename column skill_name to skill_slug;
        alter table skill_evaluation_report_findings rename column skill_name to skill_slug;
        alter table skill_evaluation_tasks rename column skill_name to skill_slug;
        alter table skill_evaluation_task_findings rename column skill_name to skill_slug;
        alter table skill_contributors rename column skill_name to skill_slug;
        alter table skill_issues rename column skill_name to skill_slug;
        alter table skill_ratings rename column skill_name to skill_slug;
      `);
    }

    const versionColumns = await client.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_schema = 'public' and table_name = 'skill_versions'`
    );
    if (!versionColumns.rows.some((row) => row.column_name === "manifest_name")) {
      await client.query(`
        alter table skill_versions add column manifest_name text;
        update skill_versions as registry_version
        set manifest_name = skill.name
        from skills as skill
        where skill.slug = registry_version.skill_slug;
        alter table skill_versions alter column manifest_name set not null;
      `);
    }

    await client.query(
      `insert into platform_schema_migrations (name, applied_at)
       values ($1, now())
       on conflict (name) do nothing`,
      [migrationName]
    );
  }

  private async migratePublishMetadata(client: pg.PoolClient): Promise<void> {
    const migrationName = "registry-publish-metadata-v3";
    const applied = await client.query<{ name: string }>(
      "select name from platform_schema_migrations where name = $1",
      [migrationName]
    );
    if (applied.rows.length > 0) {
      return;
    }

    await client.query(`
      alter table skill_versions add column if not exists categories text[] not null default array[]::text[];
      alter table skill_versions add column if not exists topics text[] not null default array[]::text[];
      alter table skill_versions add column if not exists release_tags text[] not null default array[]::text[];

      update skill_versions as registry_version
      set release_tags = case
        when skill.latest_version = registry_version.version then array['latest']::text[]
        else array[]::text[]
      end
      from skills as skill
      where skill.slug = registry_version.skill_slug
        and cardinality(registry_version.release_tags) = 0;
    `);

    await client.query(
      `insert into platform_schema_migrations (name, applied_at)
       values ($1, now())
       on conflict (name) do nothing`,
      [migrationName]
    );
  }

  private ensureSchema(): Promise<void> {
    this.schemaReady ??= (async () => {
      const { runMigrations } = await import("../migrate");
      await runMigrations(this.pool);
      const client = await this.pool.connect();
      try {
        await client.query("begin");
        await this.migrateLegacyRegistry(client);
        await this.migrateSlugIdentity(client);
        await this.migratePublishMetadata(client);
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


const knownManifestProperties = new Set([
  "slug",
  "name",
  "description",
  "version",
  "categories",
  "topics",
  "release-tags",
  "author",
  "license",
  "tags",
  "supportedAgents",
  "allowed-tools",
  "disallowed-tools"
]);

interface StoredManifestList {
  defined: boolean;
  values: string[];
  isScalar: boolean;
}

function getManifestFields(manifest: SkillManifest): {
  version: string | null;
  author: string | null;
  license: string | null;
  tagsDefined: boolean;
  supportedAgents: StoredManifestList;
  allowedTools: StoredManifestList;
  disallowedTools: StoredManifestList;
} {
  const values = manifest as Record<string, unknown>;
  return {
    version: getOptionalString(values.version),
    author: getOptionalString(values.author),
    license: getOptionalString(values.license),
    tagsDefined: Object.prototype.hasOwnProperty.call(values, "tags"),
    supportedAgents: getStoredManifestList(values, "supportedAgents"),
    allowedTools: getStoredManifestList(values, "allowed-tools"),
    disallowedTools: getStoredManifestList(values, "disallowed-tools")
  };
}

function getStoredManifestList(values: Record<string, unknown>, key: string): StoredManifestList {
  if (!Object.prototype.hasOwnProperty.call(values, key)) {
    return { defined: false, values: [], isScalar: false };
  }

  const value = values[key];
  if (typeof value === "string") {
    return { defined: true, values: [value], isScalar: true };
  }

  return {
    defined: true,
    values: Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [],
    isScalar: false
  };
}

function getManifestProperties(
  manifest: SkillManifest
): Array<{ key: string; kind: string; value: string | null }> {
  const values = manifest as Record<string, unknown>;
  const properties: Array<{ key: string; kind: string; value: string | null }> = [];

  for (const [key, value] of Object.entries(values)) {
    if (knownManifestProperties.has(key) || value === undefined) {
      continue;
    }

    if (value === null) {
      properties.push({ key, kind: "null", value: null });
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      properties.push({ key, kind: typeof value, value: String(value) });
    } else {
      properties.push({ key, kind: "json", value: JSON.stringify(value) });
    }
  }

  return properties;
}

function createManifestFromRow(
  row: DatabaseVersionRow,
  tags: string[],
  properties: DatabaseManifestPropertyRow[]
): SkillManifest {
  const manifest: Record<string, unknown> = {
    slug: row.skill_slug,
    name: row.manifest_name,
    description: row.manifest_description
  };

  if (row.manifest_version !== null) {
    manifest.version = row.manifest_version;
  }
  if (row.categories?.length) {
    manifest.categories = row.categories;
  }
  if (row.topics?.length) {
    manifest.topics = row.topics;
  }
  if (row.release_tags?.length) {
    manifest["release-tags"] = row.release_tags;
  }
  if (row.manifest_author !== null) {
    manifest.author = row.manifest_author;
  }
  if (row.manifest_license !== null) {
    manifest.license = row.manifest_license;
  }
  if (row.tags_defined) {
    manifest.tags = tags;
  }
  if (row.supported_agents_defined) {
    manifest.supportedAgents = row.supported_agents ?? [];
  }
  if (row.allowed_tools_defined) {
    manifest["allowed-tools"] = row.allowed_tools_is_scalar ? (row.allowed_tools?.[0] ?? "") : row.allowed_tools ?? [];
  }
  if (row.disallowed_tools_defined) {
    manifest["disallowed-tools"] = row.disallowed_tools_is_scalar
      ? (row.disallowed_tools?.[0] ?? "")
      : row.disallowed_tools ?? [];
  }

  for (const property of properties) {
    if (knownManifestProperties.has(property.property_key)) {
      continue;
    }
    manifest[property.property_key] = readManifestProperty(property);
  }

  return manifest as SkillManifest;
}

function readManifestProperty(property: DatabaseManifestPropertyRow): unknown {
  switch (property.value_kind) {
    case "null":
      return null;
    case "number":
      return Number(property.value_text);
    case "boolean":
      return property.value_text === "true";
    case "json":
      try {
        return JSON.parse(property.value_text ?? "null");
      } catch {
        return property.value_text;
      }
    default:
      return property.value_text ?? "";
  }
}


function toFunctionalFinding(row: DatabaseEvaluationFindingRow): FunctionalEvaluationFinding {
  return {
    id: row.finding_id,
    task: row.task_name ?? undefined,
    severity: row.severity,
    message: row.message,
    recommendation: row.recommendation,
  };
}

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
