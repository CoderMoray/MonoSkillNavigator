export function formatFindingConfidence(confidence: number | undefined): string | null {
  if (confidence === undefined || !Number.isFinite(confidence)) {
    return null;
  }
  const clamped = Math.max(0, Math.min(1, confidence));
  const percent = Math.round(clamped * 100);
  return `${percent}%`;
}
