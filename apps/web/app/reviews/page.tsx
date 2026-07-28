"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Download, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import {
  buildAuditRows,
  downloadAuditCsv,
  downloadAuditXlsx,
  sortAuditRows,
  type AuditRow,
  type AuditSortDirection,
  type AuditSortField
} from "../../lib/audit-table";
import { getSkill, getSkills } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { RegistrySkill, SkillSearchResult } from "../../lib/types";

const AUDIT_PAGE_SIZE = 20;

const SORT_FIELD_OPTIONS: { value: AuditSortField; label: string }[] = [
  { value: "publish_date", label: "publish_date" },
  { value: "skillspector_risk_score", label: "skillspector_risk_score" },
  { value: "halucatch_score", label: "halucatch_score" }
];

export default function ReviewsPage() {
  const [summaries, setSummaries] = useState<SkillSearchResult[]>([]);
  const [skills, setSkills] = useState<RegistrySkill[]>([]);
  const [detailOffset, setDetailOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [sortField, setSortField] = useState<AuditSortField>("publish_date");
  const [sortDirection, setSortDirection] = useState<AuditSortDirection>("desc");

  const hasMore = detailOffset < summaries.length;

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      setError(null);
      setSkills([]);
      setDetailOffset(0);
      try {
        const items = await getSkills();
        if (cancelled) {
          return;
        }
        setSummaries(items);
        const batch = items.slice(0, AUDIT_PAGE_SIZE);
        if (batch.length === 0) {
          setDetailOffset(0);
          return;
        }
        const details = await fetchSkillDetails(batch.map((item) => item.slug));
        if (!cancelled) {
          setSkills(details);
          setDetailOffset(batch.length);
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

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLoadMore() {
    if (loadingMore || !hasMore) {
      return;
    }
    setLoadingMore(true);
    setError(null);
    try {
      const batch = summaries.slice(detailOffset, detailOffset + AUDIT_PAGE_SIZE);
      const details = await fetchSkillDetails(batch.map((item) => item.slug));
      setSkills((current) => [...current, ...details]);
      setDetailOffset((current) => current + batch.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载更多失败");
    } finally {
      setLoadingMore(false);
    }
  }

  const auditRows = useMemo(
    () => sortAuditRows(buildAuditRows(skills), sortField, sortDirection),
    [skills, sortField, sortDirection]
  );

  const directionOptions = useMemo(
    () => directionOptionsForField(sortField),
    [sortField]
  );

  function handleSortFieldChange(nextField: AuditSortField) {
    setSortField(nextField);
    if (nextField === "publish_date") {
      setSortDirection("desc");
    }
  }

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
              <Stat label="已加载" value={auditRows.length} />
              <Stat label="Skill 总数" value={summaries.length} />
            </div>
          </div>
        </section>

        {error ? <div className="error">{error}。请确认 API 已通过 npm run dev:api 启动。</div> : null}

        <section className="market-panel">
          <div className="audit-table-toolbar">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <div>
                <h2>审查列表</h2>
                <p>与下方表格列一致，可排序并导出 CSV 或 Excel。</p>
              </div>
            </div>
            <div className="audit-toolbar-actions">
              <div className="audit-sort-controls">
                <label className="select-wrap compact">
                  <ArrowDownUp size={16} />
                  <select
                    aria-label="排序字段"
                    className="select"
                    onChange={(event) => handleSortFieldChange(event.target.value as AuditSortField)}
                    value={sortField}
                  >
                    {SORT_FIELD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="select-wrap compact">
                  <select
                    aria-label="排序方向"
                    className="select"
                    onChange={(event) => setSortDirection(event.target.value as AuditSortDirection)}
                    value={sortDirection}
                  >
                    {directionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
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
            <>
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
              {hasMore ? (
                <div className="audit-load-more">
                  <button
                    className="button secondary"
                    disabled={loadingMore}
                    onClick={() => void handleLoadMore()}
                    type="button"
                  >
                    {loadingMore ? "加载中…" : `加载更多（${detailOffset}/${summaries.length}）`}
                  </button>
                </div>
              ) : summaries.length > AUDIT_PAGE_SIZE ? (
                <p className="audit-load-more-hint">已显示全部 {summaries.length} 条记录。</p>
              ) : null}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function directionOptionsForField(field: AuditSortField): { value: AuditSortDirection; label: string }[] {
  if (field === "publish_date") {
    return [
      { value: "desc", label: "最新 → 最旧" },
      { value: "asc", label: "最旧 → 最新" }
    ];
  }
  return [
    { value: "desc", label: "高 → 低" },
    { value: "asc", label: "低 → 高" }
  ];
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

async function fetchSkillDetails(slugs: string[]): Promise<RegistrySkill[]> {
  if (slugs.length === 0) {
    return [];
  }
  return Promise.all(slugs.map((slug) => getSkill(slug)));
}
