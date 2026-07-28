import { saveBlobAsFile } from "./api";
import { formatDateTime } from "./format";
import type { FunctionalEvaluationReport, RegistrySkill } from "./types";

export interface AuditRow {
  slug: string;
  skillName: string;
  creatorLabel: string;
  creatorHandle?: string;
  version: string;
  publishDate: string;
  skillSpectorRiskScore: number | null;
  haluCatchScore: number | null;
}

export interface AuditExportRecord {
  rank: number;
  skill_name: string;
  creator: string;
  version: string;
  publish_date: string;
  skillspector_risk_score: number | "";
  halucatch_score: number | "";
}

const EXPORT_HEADERS: (keyof AuditExportRecord)[] = [
  "rank",
  "skill_name",
  "creator",
  "version",
  "publish_date",
  "skillspector_risk_score",
  "halucatch_score"
];

export function buildAuditRows(skills: RegistrySkill[]): AuditRow[] {
  const rows: AuditRow[] = [];

  for (const skill of skills) {
    const latest = skill.versions[skill.latestVersion];
    if (!latest) {
      continue;
    }

    const owner =
      skill.contributors.find((contributor) => contributor.role === "owner") ?? skill.contributors[0];

    rows.push({
      slug: skill.slug,
      skillName: skill.name,
      creatorLabel: owner?.name ?? owner?.username ?? "—",
      creatorHandle: owner?.username,
      version: latest.version,
      publishDate: latest.createdAt,
      skillSpectorRiskScore: latest.review.skillSpector?.riskScore ?? null,
      haluCatchScore: resolveHaluCatchScore(latest.evaluation)
    });
  }

  return rows.sort((left, right) => publishTime(right.publishDate) - publishTime(left.publishDate));
}

function publishTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function auditRowsToExportRecords(rows: AuditRow[]): AuditExportRecord[] {
  return rows.map((row, index) => ({
    rank: index + 1,
    skill_name: row.skillName,
    creator: formatCreatorForExport(row),
    version: row.version,
    publish_date: formatDateTime(row.publishDate),
    skillspector_risk_score: row.skillSpectorRiskScore ?? "",
    halucatch_score: row.haluCatchScore ?? ""
  }));
}

export function downloadAuditCsv(rows: AuditRow[]): void {
  const records = auditRowsToExportRecords(rows);
  const lines = [
    EXPORT_HEADERS.join(","),
    ...records.map((record) => EXPORT_HEADERS.map((header) => escapeCsvCell(record[header])).join(","))
  ];
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  saveBlobAsFile(blob, buildAuditExportFileName("csv"));
}

export async function downloadAuditXlsx(rows: AuditRow[]): Promise<void> {
  const XLSX = await import("xlsx");
  const records = auditRowsToExportRecords(rows);
  const worksheet = XLSX.utils.json_to_sheet(records, { header: [...EXPORT_HEADERS] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "audits");
  XLSX.writeFile(workbook, buildAuditExportFileName("xlsx"));
}

function resolveHaluCatchScore(evaluation: FunctionalEvaluationReport | undefined): number | null {
  if (!evaluation || evaluation.provider !== "halucatch-adapter") {
    return null;
  }
  return evaluation.score;
}

function formatCreatorForExport(row: AuditRow): string {
  if (row.creatorHandle) {
    return `${row.creatorLabel} (@${row.creatorHandle})`;
  }
  return row.creatorLabel;
}

function escapeCsvCell(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildAuditExportFileName(extension: "csv" | "xlsx"): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `skill-audits-${stamp}.${extension}`;
}
