import type { VirusTotalThreatVerdict } from "../lib/types";

const THREAT_VERDICT_LABELS: Record<VirusTotalThreatVerdict, string> = {
  VERDICT_MALICIOUS: "恶意",
  VERDICT_SUSPICIOUS: "可疑",
  VERDICT_UNDETECTED: "未检出威胁",
  VERDICT_UNKNOWN: "未知"
};

export function formatVirusTotalThreatVerdict(
  verdict: VirusTotalThreatVerdict | undefined
): string | undefined {
  if (!verdict) {
    return undefined;
  }
  return THREAT_VERDICT_LABELS[verdict] ?? verdict;
}
