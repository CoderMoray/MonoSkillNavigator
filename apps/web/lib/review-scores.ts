import type { ReviewScores } from "./types";

const scoreKeys: Array<keyof ReviewScores> = [
  "complianceScore",
  "securityScore",
  "privacyScore",
  "qualityScore",
  "reliabilityScore"
];

export function averageReviewScores(items: Array<{ scores: ReviewScores }>): ReviewScores | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const totals = Object.fromEntries(scoreKeys.map((key) => [key, 0])) as Record<keyof ReviewScores, number>;
  for (const item of items) {
    for (const key of scoreKeys) {
      totals[key] += item.scores[key];
    }
  }

  const count = items.length;
  return {
    complianceScore: Math.round(totals.complianceScore / count),
    securityScore: Math.round(totals.securityScore / count),
    privacyScore: Math.round(totals.privacyScore / count),
    qualityScore: Math.round(totals.qualityScore / count),
    reliabilityScore: Math.round(totals.reliabilityScore / count)
  };
}
