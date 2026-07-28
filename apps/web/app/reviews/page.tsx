"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import {
  buildAuditRows,
  downloadAuditCsv,
  downloadAuditXlsx,
  type AuditRow
} from "../../lib/audit-table";
import { getSkill, getSkills } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { RegistrySkill } from "../../lib/types";

export default function ReviewsPage() {
  const [skills, setSkills] = useState<RegistrySkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const summaries = await getSkills();
        const details = await Promise.all(summaries.map((item) => getSkill(item.slug)));
        if (!cancelled) {
          setSkills(details);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const auditRows = useMemo(() => buildAuditRows(skills), [skills]);

  async function handleExportCsv() {
    if (auditRows.length === 0) {
      return;
    }
    setExporting("csv");
    try {
      downloadAuditCsv(auditRows);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportXlsx() {
    if (auditRows.length === 0) {
      return;
    }
    setExporting("xlsx");
    try {
      await downloadAuditXlsx(auditRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出 Excel 失败");
    } finally {
      setExporting(null);
    }
  }

  return (
    <AppShell title="审查中心">
      <div className="page-stack">
        <section className="hero">
          <div className="hero-card">
            <span className="eyebrow">
              <ShieldCheck size={14} />
              Audits
            </span>
            <h1>审查中心</h1>
            <p>按 Skill 汇总最新版本的发布时间与 SkillSpector 风险分、HaluCatch 质量分。</p>
          </div>
          <div className="stats-card hero-card">
            <div className="stat-grid">
              <Stat label="Skill 数" value={auditRows.length} />
            </div>
          </div>
        </section>

        {error ? <div className="error">{error}。请确认 API 已通过 npm run dev:api 启动。</div> : null}

        <section className="market-panel">
          <div className="audit-table-toolbar">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <div>
                <h2>审查列表</h2>
                <p>与下方表格列一致，可导出 CSV 或 Excel。</p>
              </div>
            </div>
            <div className="audit-export-actions">
              <button
                className="button secondary compact"
                disabled={loading || auditRows.length === 0 || exporting !== null}
                onClick={() => void handleExportCsv()}
                type="button"
              >
                <Download size={15} />
                {exporting === "csv" ? "导出中…" : "导出 CSV"}
              </button>
              <button
                className="button secondary compact"
                disabled={loading || auditRows.length === 0 || exporting !== null}
                onClick={() => void handleExportXlsx()}
                type="button"
              >
                <FileSpreadsheet size={15} />
                {exporting === "xlsx" ? "导出中…" : "导出 Excel"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="audit-table-wrap">
              {Array.from({ length: 8 }).map((_, index) => (
                <div className="skeleton-row" key={index} style={{ marginBottom: 10 }} />
              ))}
            </div>
          ) : auditRows.length === 0 ? (
            <div className="empty">暂无审查数据。可以先发布 demo skill。</div>
          ) : (
            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th scope="col">排序</th>
                    <th scope="col">skill_name</th>
                    <th scope="col">creator</th>
                    <th scope="col">version</th>
                    <th scope="col">publish_date</th>
                    <th scope="col">skillspector_risk_score</th>
                    <th scope="col">halucatch_score</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row, index) => (
                    <AuditTableRow key={row.slug} rank={index + 1} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function AuditTableRow({ rank, row }: { rank: number; row: AuditRow }) {
  return (
    <tr>
      <td className="audit-table-rank">{rank}</td>
      <td>
        <Link className="audit-table-skill-link" href={`/skills/${encodeURIComponent(row.slug)}`}>
          {row.skillName}
        </Link>
      </td>
      <td>
        {row.creatorHandle ? (
          <Link href={`/creators/${encodeURIComponent(row.creatorHandle)}`}>{row.creatorLabel}</Link>
        ) : (
          row.creatorLabel
        )}
      </td>
      <td className="mono">{row.version}</td>
      <td>{formatDateTime(row.publishDate)}</td>
      <td>{formatRiskScore(row.skillSpectorRiskScore)}</td>
      <td>{formatHaluCatchScore(row.haluCatchScore)}</td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <p className="stat-value">{value}</p>
      <p className="stat-label">{label}</p>
    </div>
  );
}

function formatRiskScore(score: number | null): string {
  if (score === null) {
    return "—";
  }
  return String(score);
}

function formatHaluCatchScore(score: number | null): string {
  if (score === null) {
    return "—";
  }
  return String(score);
}
