import type { FunctionalEvaluationFinding, FunctionalEvaluationReport, FunctionalEvaluationTaskResult } from "@skill-platform/evaluator";
import type { ReviewFinding, ReviewReport, ReviewVerdict } from "@skill-platform/review-engine";
import { getSkillSlug, readSkillZipBuffer, skillSnapshotToZipBuffer, type SkillManifest, type SkillSnapshot } from "@skill-platform/skill-spec";
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
