import type { ReviewSeverity, ReviewVerdict } from "./types";

export function formatDateTime(input: string | undefined): string {
  if (!input) {
    return "-";
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false
  }).format(date);
}

export function formatNumber(value: number | undefined): string {
  return new Intl.NumberFormat("zh-CN").format(value ?? 0);
}

export function verdictLabel(verdict: ReviewVerdict): string {
  const labels: Record<ReviewVerdict, string> = {
    published: "已发布",
    "needs-review": "需复核",
    rejected: "已拒绝"
  };
  return labels[verdict];
}

export function severityLabel(severity: ReviewSeverity): string {
  const labels: Record<ReviewSeverity, string> = {
    low: "低",
    medium: "中",
    high: "高",
    critical: "严重"
  };
  return labels[severity];
}
