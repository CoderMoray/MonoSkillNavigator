export const SKILL_RECYCLE_RETENTION_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function skillRecycleRetentionMs(): number {
  return SKILL_RECYCLE_RETENTION_DAYS * MS_PER_DAY;
}

export function skillRecyclePurgeAt(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + skillRecycleRetentionMs());
}
