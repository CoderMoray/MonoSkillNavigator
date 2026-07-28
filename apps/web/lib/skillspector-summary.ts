import type { SkillSpectorScanSummary } from "./types";

const RISK_SEVERITY_LABELS: Record<string, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
  CRITICAL: "严重"
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  SAFE: "可安装（SAFE）",
  CAUTION: "谨慎（CAUTION）",
  DO_NOT_INSTALL: "不建议安装（DO_NOT_INSTALL）"
};

export function formatSkillSpectorRiskSeverity(severity: string | undefined): string {
  if (!severity) {
    return "-";
  }
  const key = severity.trim().toUpperCase();
  return RISK_SEVERITY_LABELS[key] ?? severity;
}

export function formatSkillSpectorRecommendation(recommendation: string | undefined): string {
  if (!recommendation) {
    return "-";
  }
  const key = recommendation.trim().toUpperCase();
  return RECOMMENDATION_LABELS[key] ?? recommendation;
}

export function formatSkillSpectorScanMode(scanMode: string | undefined): string {
  if (!scanMode) {
    return "-";
  }
  if (scanMode === "static-only") {
    return "仅静态扫描";
  }
  return scanMode;
}

export function formatSkillSpectorSummaryLine(summary: SkillSpectorScanSummary): string {
  return `当前风险分 ${summary.riskScore}/100（${formatSkillSpectorRiskSeverity(summary.riskSeverity)}）。`;
}
