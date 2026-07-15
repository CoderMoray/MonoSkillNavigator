import type { RegistryContributor, SkillSearchResult } from "./types";

export interface CreatorSummary {
  name: string;
  handle: string;
  role: RegistryContributor["role"];
  published: number;
  downloads: number;
  ratingCount: number;
  averageRating: number;
  skills: SkillSearchResult[];
}

export function aggregateCreators(skills: SkillSearchResult[]): CreatorSummary[] {
  const creators = new Map<string, CreatorSummary>();

  for (const skill of skills) {
    const contributors = skill.contributors.length > 0 ? skill.contributors : [unknownContributor()];

    for (const contributor of contributors) {
      const handle = normalizeHandle(contributor.username ?? contributor.name);
      const existing = creators.get(handle);
      const summary =
        existing ??
        ({
          name: contributor.name,
          handle,
          role: contributor.role,
          published: 0,
          downloads: 0,
          ratingCount: 0,
          averageRating: 0,
          skills: []
        } satisfies CreatorSummary);

      summary.published += 1;
      summary.downloads += skill.downloads;
      summary.ratingCount += skill.ratingCount;
      summary.skills.push(skill);
      summary.averageRating = weightedAverage(summary.skills);
      creators.set(handle, summary);
    }
  }

  return [...creators.values()].sort((a, b) => b.downloads - a.downloads || b.published - a.published);
}

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

function weightedAverage(skills: SkillSearchResult[]): number {
  const rated = skills.filter((skill) => skill.averageRating > 0 && skill.ratingCount > 0);
  const ratings = rated.reduce((total, skill) => total + skill.ratingCount, 0);
  if (ratings === 0) {
    return 0;
  }

  const score = rated.reduce((total, skill) => total + skill.averageRating * skill.ratingCount, 0);
  return Math.round((score / ratings) * 10) / 10;
}

function unknownContributor(): RegistryContributor {
  return {
    id: "unknown",
    name: "unknown",
    role: "contributor",
    addedAt: new Date(0).toISOString()
  };
}
