import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import type { ReviewReport } from "@skill-platform/review-engine";
import { getSkillSlug, type SkillSnapshot } from "@skill-platform/skill-spec";
import type {
  ArtifactStore,
  CreateIssueInput,
  CreateRatingInput,
  IssueStatus,
  LeaderboardSort,
  PublishSnapshotOptions,
  RegistryContributor,
  RegistryData,
  RegistryIssue,
  RegistryRating,
  RegistrySkill,
  RegistryVersion,
  RegistryStore,
  SkillSearchResult,
} from "../types";
import {
  createId,
  createOwnerContributor,
  emptyRegistry,
  matchesContributorUser,
  normalizeReleaseTags,
  resolveVersionReference,
  toSearchResult,
  updateRatingAggregate,
} from "../utils";

export abstract class JsonRegistryStore implements RegistryStore {
  protected constructor(protected readonly artifactStore?: ArtifactStore) {}

  async publishSnapshot(
    snapshot: SkillSnapshot,
    review: ReviewReport,
    evaluation?: FunctionalEvaluationReport,
    options: PublishSnapshotOptions = {}
  ): Promise<RegistryVersion> {
    const data = await this.load();
    const slug = getSkillSlug(snapshot.manifest);
    snapshot = { ...snapshot, manifest: { ...snapshot.manifest, slug } };
    const version = review.version;
    const now = new Date().toISOString();
    const existingSkill = data.skills[slug];
    const releaseTags = normalizeReleaseTags(
      options.releaseTags ?? snapshot.manifest["release-tags"] ?? ["latest"]
    );

    if (existingSkill?.versions[version]) {
      throw new Error(`Version already exists: ${slug}@${version}`);
    }
    if (!existingSkill && !releaseTags.includes("latest")) {
      throw new Error("The first published version of a Skill must include the latest release tag");
    }

    const artifact = await this.artifactStore?.putSnapshot(slug, version, snapshot);
    const registryVersion: RegistryVersion = {
      version,
      manifest: snapshot.manifest,
      contentHash: snapshot.contentHash,
      snapshot,
      artifact,
      review,
      evaluation,
      status: review.verdict,
      releaseTags,
      changelog: options.changelog,
      downloads: 0,
      createdAt: now,
      updatedAt: now,
    };

    const ownerContributor = createOwnerContributor(snapshot, now, options);
    const contributors = existingSkill?.contributors ?? [ownerContributor];
    if (existingSkill && options.owner && !existingSkill.ownerUserId &&
        !contributors.some((item) => matchesContributorUser(item, options.owner!.userId, options.owner!.username))) {
      contributors.push(ownerContributor);
    }

    const versions = Object.fromEntries(
      Object.entries(existingSkill?.versions ?? {}).map(([v, rv]) => [
        v,
        { ...rv, releaseTags: rv.releaseTags.filter((t) => !releaseTags.includes(t)) },
      ])
    );

    data.skills[slug] = {
      slug,
      name: snapshot.manifest.name,
      description: snapshot.manifest.description,
      ownerUserId: existingSkill?.ownerUserId ?? options.owner?.userId,
      latestVersion: releaseTags.includes("latest") ? version : (existingSkill?.latestVersion ?? version),
      versions: { ...versions, [version]: registryVersion },
      contributors,
      issues: existingSkill?.issues ?? [],
      ratings: existingSkill?.ratings ?? [],
      averageRating: existingSkill?.averageRating ?? 0,
      ratingCount: existingSkill?.ratingCount ?? 0,
      createdAt: existingSkill?.createdAt ?? now,
      updatedAt: now,
    };

    await this.save(data);
    return registryVersion;
  }

  async upsertReview(slug: string, version: string, review: ReviewReport): Promise<RegistryVersion> {
    const data = await this.load();
    const registryVersion = data.skills[slug]?.versions[version];
    if (!registryVersion) throw new Error(`Version not found: ${slug}@${version}`);
    registryVersion.review = review;
    registryVersion.status = review.verdict;
    registryVersion.updatedAt = new Date().toISOString();
    data.skills[slug]!.updatedAt = registryVersion.updatedAt;
    await this.save(data);
    return registryVersion;
  }

  async upsertEvaluation(slug: string, version: string, evaluation: FunctionalEvaluationReport): Promise<RegistryVersion> {
    const data = await this.load();
    const registryVersion = data.skills[slug]?.versions[version];
    if (!registryVersion) throw new Error(`Version not found: ${slug}@${version}`);
    registryVersion.evaluation = evaluation;
    registryVersion.updatedAt = new Date().toISOString();
    data.skills[slug]!.updatedAt = registryVersion.updatedAt;
    await this.save(data);
    return registryVersion;
  }

  async addContributor(slug: string, contributor: Omit<RegistryContributor, "id" | "addedAt">): Promise<RegistryContributor> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) throw new Error(`Skill not found: ${slug}`);
    const existing = skill.contributors.find((item) => item.name.toLowerCase() === contributor.name.toLowerCase());
    const now = new Date().toISOString();
    if (existing) {
      existing.role = contributor.role;
      skill.updatedAt = now;
      await this.save(data);
      return existing;
    }
    const created: RegistryContributor = { id: createId("contributor"), ...contributor, addedAt: now };
    skill.contributors.push(created);
    skill.updatedAt = now;
    await this.save(data);
    return created;
  }

  async createIssue(slug: string, issue: CreateIssueInput): Promise<RegistryIssue> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) throw new Error(`Skill not found: ${slug}`);
    const now = new Date().toISOString();
    const created: RegistryIssue = {
      id: createId("issue"), type: issue.type, status: "open",
      severity: issue.severity ?? "medium", title: issue.title, body: issue.body,
      createdBy: issue.createdBy, createdAt: now, updatedAt: now,
    };
    skill.issues.push(created);
    skill.updatedAt = now;
    await this.save(data);
    return created;
  }

  async listIssues(slug: string, status?: IssueStatus): Promise<RegistryIssue[]> {
    const data = await this.load();
    const issues = data.skills[slug]?.issues ?? [];
    return status ? issues.filter((i) => i.status === status) : issues;
  }

  async addRating(slug: string, rating: CreateRatingInput): Promise<RegistryRating> {
    if (rating.score < 1 || rating.score > 5) throw new Error("Rating score must be between 1 and 5");
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) throw new Error(`Skill not found: ${slug}`);
    const created: RegistryRating = {
      id: createId("rating"), version: rating.version, user: rating.user,
      score: rating.score, comment: rating.comment, createdAt: new Date().toISOString(),
    };
    skill.ratings.push(created);
    updateRatingAggregate(skill);
    skill.updatedAt = created.createdAt;
    await this.save(data);
    return created;
  }

  async search(query = ""): Promise<SkillSearchResult[]> {
    const data = await this.load();
    const q = query.trim().toLowerCase();
    return Object.values(data.skills)
      .filter((s) => !q || s.slug.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      .map(toSearchResult)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSkill(slug: string): Promise<RegistrySkill | undefined> {
    return (await this.load()).skills[slug];
  }

  async getVersion(slug: string, version = "latest"): Promise<RegistryVersion | undefined> {
    const skill = (await this.load()).skills[slug];
    if (!skill) return undefined;
    return skill.versions[resolveVersionReference(skill, version)];
  }

  async leaderboard(sort: LeaderboardSort = "downloads", limit = 20): Promise<SkillSearchResult[]> {
    const items = await this.search();
    return items.sort((a, b) => {
      switch (sort) {
        case "rating": return b.averageRating - a.averageRating || b.ratingCount - a.ratingCount;
        case "quality": return b.scores.qualityScore - a.scores.qualityScore;
        case "security": return b.scores.securityScore - a.scores.securityScore;
        case "functional": return b.scores.functionalScore - a.scores.functionalScore;
        case "recent": return b.updatedAt.localeCompare(a.updatedAt);
        default: return b.downloads - a.downloads;
      }
    }).slice(0, Math.max(1, Math.min(limit, 100)));
  }

  async downloadSnapshot(slug: string, version = "latest"): Promise<SkillSnapshot | undefined> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) return undefined;
    const resolved = resolveVersionReference(skill, version);
    const rv = skill.versions[resolved];
    if (!rv) return undefined;
    const snapshot = rv.artifact && this.artifactStore
      ? await this.artifactStore.getSnapshot(rv.artifact)
      : rv.snapshot;
    rv.downloads += 1;
    rv.updatedAt = new Date().toISOString();
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
      for (const rv of Object.values(skill.versions)) {
        const snapshot = rv.artifact && this.artifactStore
          ? await this.artifactStore.getSnapshot(rv.artifact)
          : rv.snapshot;
        rv.snapshot = snapshot;
        rv.review = reviewFn(snapshot, rv.version);
        rv.evaluation = evaluationFn?.(snapshot) ?? rv.evaluation;
        rv.status = rv.review.verdict;
        rv.updatedAt = new Date().toISOString();
        reviewed.push(rv);
      }
      skill.updatedAt = new Date().toISOString();
    }
    await this.save(data);
    return reviewed;
  }

  protected abstract load(): Promise<RegistryData>;
  protected abstract save(data: RegistryData): Promise<void>;
}
