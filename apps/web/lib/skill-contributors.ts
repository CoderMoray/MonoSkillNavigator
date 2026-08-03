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

export function isSkillContributor(skill: RegistrySkill, user: PublicUser): boolean {
  if (user.role === "admin") {
    return true;
  }

  if (skill.ownerUserId && skill.ownerUserId === user.id) {
    return true;
  }

  return skill.contributors.some((contributor) => matchesContributorUser(contributor, user.id, user.username));
}
