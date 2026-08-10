import type { ContributorRole } from "./types";

export const CONTRIBUTOR_ROLES: readonly ContributorRole[] = ["owner", "contributor"];

export function isContributorRole(value: string): value is ContributorRole {
  return value === "owner" || value === "contributor";
}

export function assertContributorRole(role: string): ContributorRole {
  const normalized = role.trim().toLowerCase();
  if (isContributorRole(normalized)) {
    return normalized;
  }
  throw new Error("invalid_contributor_role");
}

export function normalizeContributorRole(role: string): ContributorRole {
  const normalized = role.trim().toLowerCase();
  if (normalized === "maintainer" || normalized === "reviewer") {
    return "contributor";
  }
  if (isContributorRole(normalized)) {
    return normalized;
  }
  return "contributor";
}
