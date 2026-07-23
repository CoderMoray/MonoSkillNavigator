import {
  aggregateCreators,
  createEmptyCreatorSummary,
  listCreators,
  normalizeHandle,
  type CreatorSummary
} from "@skill-platform/storage/creators";

export {
  aggregateCreators,
  createEmptyCreatorSummary,
  listCreators,
  normalizeHandle,
  type CreatorSummary
};

export function creatorProfilePath(username: string): string {
  return `/creators/${encodeURIComponent(normalizeHandle(username))}`;
}
