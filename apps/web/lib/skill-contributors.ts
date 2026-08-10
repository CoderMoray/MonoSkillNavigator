import type { PublicUser, RegistryContributor, RegistrySkill } from "./types";

function matchesContributorUser(
  contributor: RegistryContributor,
  userId: string,
  username: string
): boolean {
  const normalizedUsername = username.trim().toLowerCase();
  return (
    (contributor.userId !== undefined && contributor.userId === userId) ||
    (contributor.username !== undefined && contributor.username.trim().toLowerCase() === normalizedUsername)
  );
}

export function isSkillOwner(skill: RegistrySkill, user: PublicUser): boolean {
  if (skill.ownerUserId && skill.ownerUserId === user.id) {
    return true;
  }

  return skill.contributors.some(
    (contributor) =>
      contributor.role === "owner" && matchesContributorUser(contributor, user.id, user.username)
  );
}

export function isSkillContributor(skill: RegistrySkill, user: PublicUser): boolean {
  if (user.role === "admin") {
    return true;
  }

  if (skill.ownerUserId && skill.ownerUserId === user.id) {
    return true;
  }

  return skill.contributors.some((contributor) => matchesContributorUser(contributor, user.id, user.username));
}

export function findSkillContributorByHandle(
  skill: RegistrySkill,
  handle: string
): RegistryContributor | undefined {
  const normalized = handle.trim().toLowerCase();
  return skill.contributors.find(
    (contributor) =>
      contributor.name.trim().toLowerCase() === normalized ||
      (contributor.username !== undefined && contributor.username.trim().toLowerCase() === normalized)
  );
}
