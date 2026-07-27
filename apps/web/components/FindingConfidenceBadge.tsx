import type { ReviewFinding } from "../lib/types";
import { formatFindingConfidence } from "../lib/finding-confidence";

export function FindingConfidenceBadge({ finding }: { finding: ReviewFinding }) {
  const label = formatFindingConfidence(finding.confidence);
  if (!label) {
    return null;
  }

  return <span className="badge finding-confidence">置信度 {label}</span>;
}
