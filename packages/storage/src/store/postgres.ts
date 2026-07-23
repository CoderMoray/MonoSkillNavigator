import type { FunctionalEvaluationFinding, FunctionalEvaluationReport, FunctionalEvaluationTaskResult, HaluCatchReportBundle } from "@skill-platform/evaluator";
import type { ReviewFinding, ReviewReport, ReviewVerdict } from "@skill-platform/review-engine";
import {
  getSkillSlug,
  parseSkillMarkdown,
  readSkillZipBuffer,
  findSkillEntryFile,
  skillSnapshotToZipBuffer,
  type SkillManifest,
  type SkillSnapshot
} from "@skill-platform/skill-spec";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, sql, desc, or, ilike, inArray } from "drizzle-orm";
import pg from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../schema";
import type {
  ArtifactDescriptor, ArtifactProvider, ArtifactStore,
  ContributorRole, IssueSeverity, IssueStatus, IssueType,
  PostgresRegistryStoreOptions,
  RegistryContributor, RegistryData, RegistryIssue, RegistryRating,
  RegistrySkill, RegistryVersion, SkillSearchResult, LeaderboardSort,
} from "../types";
import { emptyRegistry, normalizeRegistryData, toSearchResult } from "../utils";
import { JsonRegistryStore } from "./base";

type DB = NodePgDatabase<typeof schema>;

type EvaluationFindingRow = {
  findingId: string;
  taskName: string | null;
  severity: string;
  message: string;
  recommendation: string;
};

function toFunctionalEvaluationFinding(row: EvaluationFindingRow): FunctionalEvaluationFinding {
  return {
    id: row.findingId,
    task: row.taskName ?? undefined,
    severity: row.severity as FunctionalEvaluationFinding["severity"],
    message: row.message,
    recommendation: row.recommendation,
  };
}

function parseHaluCatchReport(value: string | null | undefined): HaluCatchReportBundle | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as HaluCatchReportBundle;
  } catch {
    return undefined;
  }
}

function serializeHaluCatchReport(report: HaluCatchReportBundle | undefined): string | null {
  return report ? JSON.stringify(report) : null;
}

function toStringList(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function replaceEvaluationDetails(db: any, slug: string, version: string, evaluation: FunctionalEvaluationReport) {
  const reportFindings = Array.isArray(evaluation.findings) ? evaluation.findings : [];
  const taskResults = Array.isArray(evaluation.taskResults) ? evaluation.taskResults : [];

  await db.delete(schema.skillEvaluationReportFindings)
    .where(and(eq(schema.skillEvaluationReportFindings.skillSlug, slug), eq(schema.skillEvaluationReportFindings.version, version)));
  await db.delete(schema.skillEvaluationTaskFindings)
    .where(and(eq(schema.skillEvaluationTaskFindings.skillSlug, slug), eq(schema.skillEvaluationTaskFindings.version, version)));
  await db.delete(schema.skillEvaluationTasks)
    .where(and(eq(schema.skillEvaluationTasks.skillSlug, slug), eq(schema.skillEvaluationTasks.version, version)));

  if (reportFindings.length) {
    await db.insert(schema.skillEvaluationReportFindings).values(
      reportFindings.map((finding, position) => ({
        skillSlug: slug,
        version,
        position,
        findingId: finding.id ?? `evaluation_report_finding_${position}`,
        taskName: finding.task ?? null,
        severity: finding.severity,
        message: finding.message,
        recommendation: finding.recommendation,
      }))
    );
  }

  if (taskResults.length) {
    await db.insert(schema.skillEvaluationTasks).values(
      taskResults.map((task, taskPosition) => ({
        skillSlug: slug,
        version,
        taskPosition,
        name: task.name,
        score: task.score,
      }))
    );

    const taskFindings = taskResults.flatMap((task, taskPosition) =>
      (Array.isArray(task.findings) ? task.findings : []).map((finding, position) => ({
        skillSlug: slug,
        version,
        taskPosition,
        position,
        findingId: finding.id ?? `evaluation_task_finding_${taskPosition}_${position}`,
        taskName: finding.task ?? task.name,
        severity: finding.severity,
        message: finding.message,
        recommendation: finding.recommendation,
      }))
    );

    if (taskFindings.length) {
      await db.insert(schema.skillEvaluationTaskFindings).values(taskFindings);
    }
  }
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

  // ==================== Read Operations ====================

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
        complianceScore: schema.skillReviews.complianceScore,
        qualityScore: schema.skillReviews.qualityScore,
        securityScore: schema.skillReviews.securityScore,
        privacyScore: schema.skillReviews.privacyScore,
        reliabilityScore: schema.skillReviews.reliabilityScore,
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
        and(
          eq(schema.skills.published, true),
          q
            ? or(
                ilike(schema.skills.slug, searchPattern),
                ilike(schema.skills.name, searchPattern),
                ilike(schema.skills.description, searchPattern)
              )
            : undefined
        )
      )
      .groupBy(
        schema.skills.slug, schema.skills.name, schema.skills.description,
        schema.skills.latestVersion, schema.skillVersions.status,
        schema.skillReviews.complianceScore, schema.skillReviews.qualityScore,
        schema.skillReviews.securityScore, schema.skillReviews.privacyScore,
        schema.skillReviews.reliabilityScore, schema.skills.averageRating,
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
        complianceScore: Number(r.complianceScore),
        qualityScore: Number(r.qualityScore),
        securityScore: Number(r.securityScore),
        privacyScore: Number(r.privacyScore),
        reliabilityScore: Number(r.reliabilityScore),
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
      const parsedManifest = (() => {
        const skillMd = findSkillEntryFile(files);
        if (!skillMd) return undefined;
        try {
          return parseSkillMarkdown(skillMd.content).manifest;
        } catch {
          return undefined;
        }
      })();

      const [review] = await this.db.select()
        .from(schema.skillReviews)
        .where(and(eq(schema.skillReviews.skillSlug, slug), eq(schema.skillReviews.version, v.version)));

      const findings = review
        ? await this.db.select().from(schema.skillReviewFindings)
            .where(and(eq(schema.skillReviewFindings.skillSlug, slug), eq(schema.skillReviewFindings.version, v.version)))
            .orderBy(schema.skillReviewFindings.position)
        : [];

      const [evaluation] = await this.db.select()
        .from(schema.skillEvaluations)
        .where(and(eq(schema.skillEvaluations.skillSlug, slug), eq(schema.skillEvaluations.version, v.version)));

      const evaluationTasks = evaluation
        ? await this.db.select().from(schema.skillEvaluationTasks)
            .where(and(
              eq(schema.skillEvaluationTasks.skillSlug, slug),
              eq(schema.skillEvaluationTasks.version, v.version)
            ))
            .orderBy(schema.skillEvaluationTasks.taskPosition)
        : [];

      const evaluationReportFindings = evaluation
        ? await this.db.select().from(schema.skillEvaluationReportFindings)
            .where(and(
              eq(schema.skillEvaluationReportFindings.skillSlug, slug),
              eq(schema.skillEvaluationReportFindings.version, v.version)
            ))
            .orderBy(schema.skillEvaluationReportFindings.position)
        : [];

      const evaluationTaskFindings = evaluation
        ? await this.db.select().from(schema.skillEvaluationTaskFindings)
            .where(and(
              eq(schema.skillEvaluationTaskFindings.skillSlug, slug),
              eq(schema.skillEvaluationTaskFindings.version, v.version)
            ))
            .orderBy(schema.skillEvaluationTaskFindings.taskPosition, schema.skillEvaluationTaskFindings.position)
        : [];

      const taskFindingsByPosition = new Map<number, FunctionalEvaluationFinding[]>();
      for (const finding of evaluationTaskFindings) {
        const taskFindings = taskFindingsByPosition.get(finding.taskPosition) ?? [];
        taskFindings.push(toFunctionalEvaluationFinding(finding));
        taskFindingsByPosition.set(finding.taskPosition, taskFindings);
      }

      const hydratedEvaluation: FunctionalEvaluationReport | undefined = evaluation
        ? {
            id: evaluation.evaluationId,
            provider: evaluation.provider as FunctionalEvaluationReport["provider"],
            status: evaluation.status as FunctionalEvaluationReport["status"],
            score: Number(evaluation.score),
            tasksTotal: Number(evaluation.tasksTotal),
            tasksPassed: Number(evaluation.tasksPassed),
            taskResults: evaluationTasks.map(
              (task): FunctionalEvaluationTaskResult => ({
                name: task.name,
                score: Number(task.score),
                findings: taskFindingsByPosition.get(task.taskPosition) ?? [],
              })
            ),
            findings: evaluationReportFindings.map(toFunctionalEvaluationFinding),
            haluCatchReport: parseHaluCatchReport(evaluation.haluCatchReport),
            createdAt: String(evaluation.createdAt),
          }
        : undefined;

      const manifest = {
        slug,
        name: v.manifestName,
        description: v.manifestDescription,
        version: v.manifestVersion ?? undefined,
        author: v.manifestAuthor ?? undefined,
        license: v.manifestLicense ?? undefined,
        tags: tags.map((t) => t.tag),
        ...(v.supportedAgentsDefined
          ? { supportedAgents: v.supportedAgents }
          : parsedManifest?.supportedAgents ? { supportedAgents: parsedManifest.supportedAgents } : {}),
        ...(v.allowedToolsDefined
          ? { "allowed-tools": v.allowedToolsIsScalar ? v.allowedTools[0] : v.allowedTools }
          : parsedManifest?.["allowed-tools"] !== undefined
            ? { "allowed-tools": parsedManifest["allowed-tools"] }
            : {}),
        ...(v.disallowedToolsDefined
          ? { "disallowed-tools": v.disallowedToolsIsScalar ? v.disallowedTools[0] : v.disallowedTools }
          : parsedManifest?.["disallowed-tools"] !== undefined
            ? { "disallowed-tools": parsedManifest["disallowed-tools"] }
            : {}),
        categories: v.categories,
        topics: v.topics,
        "release-tags": v.releaseTags,
      } as RegistryVersion["manifest"];

      versionMap[v.version] = {
        version: v.version,
        manifest,
        contentHash: v.contentHash,
        snapshot: {
          manifest,
          readme: v.readme,
          files: files.map((f) => ({ path: f.path, content: f.content, size: f.size, sha256: f.sha256 })),
          contentHash: v.contentHash,
          createdAt: String(v.snapshotCreatedAt),
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
            complianceScore: Number(review.complianceScore), qualityScore: Number(review.qualityScore),
            securityScore: Number(review.securityScore), privacyScore: Number(review.privacyScore),
            reliabilityScore: Number(review.reliabilityScore),
          },
          findings: findings.map((f) => ({
            id: f.findingId, category: f.category as any, severity: f.severity as any,
            title: f.title, message: f.message, path: f.path ?? undefined,
            evidence: f.evidence ?? undefined, recommendation: f.recommendation,
          })),
          createdAt: String(review.createdAt),
        } : {} as RegistryVersion["review"],
        evaluation: hydratedEvaluation,
        status: v.status as RegistryVersion["status"],
        releaseTags: v.releaseTags, changelog: v.changelog ?? undefined, downloads: Number(v.downloads),
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
      published: row.published,
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
      complianceScore: review.scores.complianceScore, qualityScore: review.scores.qualityScore,
      securityScore: review.scores.securityScore, privacyScore: review.scores.privacyScore,
      reliabilityScore: review.scores.reliabilityScore, createdAt,
    }).onConflictDoUpdate({
      target: [schema.skillReviews.skillSlug, schema.skillReviews.version],
      set: {
        reviewId: review.id, reportVersion: review.version ?? "1.0",
        contentHash: review.contentHash ?? "", verdict: review.verdict,
        complianceScore: review.scores.complianceScore, qualityScore: review.scores.qualityScore,
        securityScore: review.scores.securityScore, privacyScore: review.scores.privacyScore,
        reliabilityScore: review.scores.reliabilityScore,
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

    await this.db.transaction(async (tx) => {
      await tx.insert(schema.skillEvaluations).values({
        skillSlug: slug, version, evaluationId: evaluation.id,
        provider: evaluation.provider, status: evaluation.status,
        score: evaluation.score, tasksTotal: evaluation.tasksTotal ?? evaluation.tasks_total ?? 0,
        tasksPassed: evaluation.tasksPassed ?? evaluation.tasks_passed ?? 0,
        haluCatchReport: serializeHaluCatchReport(evaluation.haluCatchReport),
        createdAt,
      }).onConflictDoUpdate({
        target: [schema.skillEvaluations.skillSlug, schema.skillEvaluations.version],
        set: {
          evaluationId: evaluation.id, provider: evaluation.provider,
          status: evaluation.status, score: evaluation.score,
          tasksTotal: evaluation.tasksTotal ?? evaluation.tasks_total ?? 0,
          tasksPassed: evaluation.tasksPassed ?? evaluation.tasks_passed ?? 0,
          haluCatchReport: serializeHaluCatchReport(evaluation.haluCatchReport),
          createdAt,
        },
      });

      await replaceEvaluationDetails(tx, slug, version, evaluation);
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
    const supportedAgents = toStringList(snapshot.manifest.supportedAgents);
    const allowedTools = snapshot.manifest["allowed-tools"];
    const disallowedTools = snapshot.manifest["disallowed-tools"];

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
          .set({
            name,
            description,
            latestVersion: releaseTags.includes("latest") ? version : existingSkill.latestVersion,
            published: true,
            updatedAt: now
          })
          .where(eq(schema.skills.slug, slug));
      } else {
        await tx.insert(schema.skills).values({
          slug, name, description, ownerUserId: options.owner?.userId ?? null,
          latestVersion: version, published: true, createdAt: now, updatedAt: now,
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
        supportedAgents,
        supportedAgentsDefined: snapshot.manifest.supportedAgents !== undefined,
        allowedTools: toStringList(allowedTools),
        allowedToolsDefined: allowedTools !== undefined,
        allowedToolsIsScalar: typeof allowedTools === "string",
        disallowedTools: toStringList(disallowedTools),
        disallowedToolsDefined: disallowedTools !== undefined,
        disallowedToolsIsScalar: typeof disallowedTools === "string",
        categories: snapshot.manifest.categories ?? [], topics: snapshot.manifest.topics ?? [],
        releaseTags, changelog: options.changelog?.trim() || null,
        contentHash: snapshot.contentHash, readme: snapshot.readme ?? "",
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
        complianceScore: review.scores.complianceScore, qualityScore: review.scores.qualityScore,
        securityScore: review.scores.securityScore, privacyScore: review.scores.privacyScore,
        reliabilityScore: review.scores.reliabilityScore, createdAt: now,
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
          tasksPassed: evaluation.tasksPassed ?? 0,
          haluCatchReport: serializeHaluCatchReport(evaluation.haluCatchReport),
          createdAt: now,
        });
        await replaceEvaluationDetails(tx, slug, version, evaluation);
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

      const review = await reviewFn(rv.snapshot, version);
      await this.upsertReview(slug, version, review);

      if (evaluationFn) {
        const evaluation = await evaluationFn(rv.snapshot);
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

  async unpublishSkill(slug: string): Promise<RegistrySkill> {
    await this.ensureSchema();
    const now = new Date();
    const updated = await this.db.update(schema.skills)
      .set({ published: false, updatedAt: now })
      .where(eq(schema.skills.slug, slug))
      .returning({ slug: schema.skills.slug });

    if (updated.length === 0) {
      throw new Error(`Skill not found: ${slug}`);
    }

    const skill = await this.getSkill(slug);
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }
    return skill;
  }

  async deleteSkill(slug: string): Promise<void> {
    await this.ensureSchema();

    const versions = await this.db.select({
      artifactProvider: schema.skillVersions.artifactProvider,
      artifactBucket: schema.skillVersions.artifactBucket,
      artifactObjectKey: schema.skillVersions.artifactObjectKey,
      artifactContentHash: schema.skillVersions.artifactContentHash,
      artifactSize: schema.skillVersions.artifactSize,
      artifactStoredAt: schema.skillVersions.artifactStoredAt,
    }).from(schema.skillVersions).where(eq(schema.skillVersions.skillSlug, slug));

    const artifacts: ArtifactDescriptor[] = versions
      .filter((version) => version.artifactProvider && version.artifactObjectKey)
      .map((version) => ({
        provider: version.artifactProvider as ArtifactProvider,
        bucket: version.artifactBucket!,
        objectKey: version.artifactObjectKey!,
        contentHash: version.artifactContentHash ?? "",
        size: Number(version.artifactSize ?? 0),
        storedAt: String(version.artifactStoredAt ?? ""),
      }));

    await this.db.transaction(async (tx) => {
      await tx.delete(schema.skillEvaluationReportFindings).where(eq(schema.skillEvaluationReportFindings.skillSlug, slug));
      await tx.delete(schema.skillEvaluationTaskFindings).where(eq(schema.skillEvaluationTaskFindings.skillSlug, slug));
      await tx.delete(schema.skillEvaluationTasks).where(eq(schema.skillEvaluationTasks.skillSlug, slug));
      await tx.delete(schema.skillEvaluations).where(eq(schema.skillEvaluations.skillSlug, slug));
      await tx.delete(schema.skillReviewFindings).where(eq(schema.skillReviewFindings.skillSlug, slug));
      await tx.delete(schema.skillReviews).where(eq(schema.skillReviews.skillSlug, slug));
      await tx.delete(schema.skillVersionFiles).where(eq(schema.skillVersionFiles.skillSlug, slug));
      await tx.delete(schema.skillVersionManifestProperties).where(eq(schema.skillVersionManifestProperties.skillSlug, slug));
      await tx.delete(schema.skillVersionTags).where(eq(schema.skillVersionTags.skillSlug, slug));
      await tx.delete(schema.skillVersions).where(eq(schema.skillVersions.skillSlug, slug));
      await tx.delete(schema.skills).where(eq(schema.skills.slug, slug));
    });

    const artifactStore = (this as unknown as {
      artifactStore?: ArtifactStore & { removeSnapshot?: (descriptor: ArtifactDescriptor) => Promise<void> };
    }).artifactStore;
    if (artifactStore?.removeSnapshot) {
      for (const artifact of artifacts) {
        await artifactStore.removeSnapshot(artifact).catch(() => undefined);
      }
    }
  }


  // ==================== Deprecated (base class compatibility) ====================
  protected async load(): Promise<any> { throw new Error("load() is deprecated — use Drizzle methods directly"); }
  protected async save(): Promise<void> { throw new Error("save() is deprecated — use Drizzle methods directly"); }

  // ==================== Schema ====================
  private ensureSchema(): Promise<void> {
    this.schemaReady ??= (async () => {
      const { runMigrations } = await import("../migrate");
      await runMigrations(this.pool);
    })().catch((error) => {
      this.schemaReady = undefined;
      throw error;
    });
    return this.schemaReady;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
