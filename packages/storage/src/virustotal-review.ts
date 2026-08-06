import type { VirusTotalScanSummary } from "@skill-platform/review-engine";

export interface VirusTotalReviewColumns {
  virustotalProvider: string | null;
  virustotalSha256: string | null;
  virustotalStatus: string | null;
  virustotalMalicious: number | null;
  virustotalSuspicious: number | null;
  virustotalHarmless: number | null;
  virustotalUndetected: number | null;
  virustotalAnalysisUrl: string | null;
  virustotalError: string | null;
}

export function virusTotalReviewColumns(
  summary: VirusTotalScanSummary | undefined
): VirusTotalReviewColumns {
  if (!summary) {
    return {
      virustotalProvider: null,
      virustotalSha256: null,
      virustotalStatus: null,
      virustotalMalicious: null,
      virustotalSuspicious: null,
      virustotalHarmless: null,
      virustotalUndetected: null,
      virustotalAnalysisUrl: null,
      virustotalError: null
    };
  }

  return {
    virustotalProvider: summary.provider,
    virustotalSha256: summary.sha256 || null,
    virustotalStatus: summary.status,
    virustotalMalicious: summary.malicious,
    virustotalSuspicious: summary.suspicious,
    virustotalHarmless: summary.harmless,
    virustotalUndetected: summary.undetected,
    virustotalAnalysisUrl: summary.analysisUrl ?? null,
    virustotalError: summary.error ?? null
  };
}

export function parseVirusTotalReviewRow(row: {
  virustotalProvider?: string | null;
  virustotalSha256?: string | null;
  virustotalStatus?: string | null;
  virustotalMalicious?: number | null;
  virustotalSuspicious?: number | null;
  virustotalHarmless?: number | null;
  virustotalUndetected?: number | null;
  virustotalAnalysisUrl?: string | null;
  virustotalError?: string | null;
}): VirusTotalScanSummary | undefined {
  if (!row.virustotalStatus) {
    return undefined;
  }
  if (!row.virustotalSha256 && row.virustotalStatus !== "failed") {
    return undefined;
  }

  const status =
    row.virustotalStatus === "not_found"
      ? "not_found"
      : row.virustotalStatus === "failed"
        ? "failed"
        : "completed";

  return {
    provider: (row.virustotalProvider as VirusTotalScanSummary["provider"]) ?? "virustotal",
    sha256: row.virustotalSha256 ?? "",
    status,
    malicious: Number(row.virustotalMalicious ?? 0),
    suspicious: Number(row.virustotalSuspicious ?? 0),
    harmless: Number(row.virustotalHarmless ?? 0),
    undetected: Number(row.virustotalUndetected ?? 0),
    ...(row.virustotalAnalysisUrl ? { analysisUrl: row.virustotalAnalysisUrl } : {}),
    ...(row.virustotalError ? { error: row.virustotalError } : {})
  };
}
