import type { ReviewReport } from "@skill-platform/review-engine";
import type { SkillSnapshot } from "@skill-platform/skill-spec";
import {
  type RegistryContributor,
  type RegistryData,
  type RegistryIssue,
  type RegistryRating,
  type RegistrySkill,
  type RegistryVersion,
  type SkillSearchResult,
  type PublishSnapshotOptions,
  type LeaderboardSort,
} from "./types";

export const emptyRegistry: RegistryData = { skills: {} };

export function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeRegistryData(data: RegistryData): RegistryData {
  for (const skill of Object.values(data.skills ?? {})) {
    skill.slug ??= skill.name;
    skill.ownerUserId ??= skill.contributors?.find((c) => c.role === "owner")?.userId;
    skill.contributors ??= [];
    skill.issues ??= [];
    skill.ratings ??= [];
    skill.ratingCount ??= skill.ratings.length;
    skill.published ??= true;
    skill.averageRating ??= calculateAverageRating(skill.ratings);
    updateRatingAggregate(skill);

    for (const version of Object.values(skill.versions ?? {})) {
      version.downloads ??= 0;
      version.releaseTags ??= ["latest"];
    }
  }

  return { skills: data.skills ?? {} };
}

export function updateRatingAggregate(skill: RegistrySkill): void {
  skill.ratingCount = skill.ratings.length;
  skill.averageRating = calculateAverageRating(skill.ratings);
}

export function calculateAverageRating(ratings: RegistryRating[]): number {
  if (ratings.length === 0) return 0;
  const total = ratings.reduce((sum, r) => sum + r.score, 0);
  return Math.round((total / ratings.length) * 10) / 10;
}

export function createOwnerContributor(
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
      addedAt,
    };
  }
  return {
    id: createId("contributor"),
    name: snapshot.manifest.author ?? "unknown",
    role: "owner",
    addedAt,
  };
}

export function matchesContributorUser(
  contributor: RegistryContributor,
  userId: string,
  username: string
): boolean {
  return (
    contributor.userId === userId ||
    contributor.username?.toLowerCase() === username.toLowerCase() ||
    contributor.name.toLowerCase() === username.toLowerCase()
  );
}

export function safeObjectSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "ENOENT";
}

export function toSearchResult(skill: RegistrySkill): SkillSearchResult {
  const latest = skill.versions[skill.latestVersion];
  if (!latest) {
    throw new Error(`Registry is corrupt: missing latest version for ${skill.slug}`);
  }
  return {
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    latestVersion: skill.latestVersion,
    status: latest.status,
    scores: latest.review.scores,
    averageRating: skill.averageRating,
    ratingCount: skill.ratingCount,
    openIssues: skill.issues.filter((i) => i.status !== "closed").length,
    contributors: skill.contributors,
    downloads: Object.values(skill.versions).reduce((t, v) => t + v.downloads, 0),
    updatedAt: skill.updatedAt,
  };
}

export function normalizeReleaseTags(tags: unknown): string[] {
  if (!tags) return ["latest"];
  if (Array.isArray(tags)) {
    const normalized = tags.map(String).filter(Boolean);
    return normalized.length > 0 ? normalized : ["latest"];
  }
  if (typeof tags === "string") {
    const trimmed = tags.trim();
    if (!trimmed) return ["latest"];
    return [trimmed];
  }
  return ["latest"];
}

export function resolveVersionReference(skill: RegistrySkill, version: string): string {
  if (version === "latest") return skill.latestVersion;
  for (const [versionKey, registryVersion] of Object.entries(skill.versions)) {
    if (registryVersion.releaseTags.includes(version)) return versionKey;
  }
  return version;
}

export function isSkillOwner(
  skill: RegistrySkill,
  user: { id: string; username: string }
): boolean {
  if (skill.ownerUserId && skill.ownerUserId === user.id) {
    return true;
  }

  return skill.contributors.some(
    (contributor) => contributor.role === "owner" && matchesContributorUser(contributor, user.id, user.username)
  );
}

export function isSkillContributor(
  skill: RegistrySkill,
  user: { id: string; username: string; role?: string }
): boolean {
  if (user.role === "admin") return true;
  if (skill.ownerUserId && skill.ownerUserId === user.id) return true;
  return skill.contributors.some((c) => matchesContributorUser(c, user.id, user.username));
}
