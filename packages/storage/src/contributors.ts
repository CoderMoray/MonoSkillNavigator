import type { ContributorRole } from "./types";

/** Roles that can be assigned when inviting or adding a collaborator. */
export const ASSIGNABLE_CONTRIBUTOR_ROLES = ["contributor"] as const;
export type AssignableContributorRole = (typeof ASSIGNABLE_CONTRIBUTOR_ROLES)[number];

/** All contributor roles stored on skills (owner is set at publish, not via invite). */
export const CONTRIBUTOR_ROLES: readonly ContributorRole[] = ["owner", "contributor"];

export function isContributorRole(value: string): value is ContributorRole {
  return value === "owner" || value === "contributor";
}

export function assertAssignableContributorRole(role: string): AssignableContributorRole {
  const normalized = role.trim().toLowerCase();
  if (normalized === "contributor") {
    return "contributor";
  }
  throw new Error("invalid_contributor_role");
}

export function normalizeContributorRole(role: string): ContributorRole {
  const normalized = role.trim().toLowerCase();
  if (normalized === "maintainer" || normalized === "reviewer") {
    return "contributor";
  }
  if (normalized === "owner") {
    return "owner";
  }
  return "contributor";
}
