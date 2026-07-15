import type { EvaluationStatus, ReviewSeverity, ReviewVerdict } from "../lib/types";
import { severityLabel, verdictLabel } from "../lib/format";

export function VerdictBadge({ verdict }: { verdict: ReviewVerdict }) {
  return <span className={`badge ${verdict}`}>{verdictLabel(verdict)}</span>;
}

export function EvaluationBadge({ status }: { status: EvaluationStatus }) {
  const labels: Record<EvaluationStatus, string> = {
    passed: "功能通过",
    partial: "部分通过",
    failed: "功能失败",
    "not-configured": "未配置任务集"
  };

  return <span className={`badge ${status}`}>{labels[status]}</span>;
}

export function SeverityBadge({ severity }: { severity: ReviewSeverity }) {
  return <span className={`badge ${severity}`}>{severityLabel(severity)}</span>;
}
