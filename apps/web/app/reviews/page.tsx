"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  { value: "skillspector_safety_score", label: "skillspector_safety_score" },
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
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(() => new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  const hasMore = detailOffset < summaries.length;

  const auditRows = useMemo(
    () => sortAuditRows(buildAuditRows(skills), sortField, sortDirection),
    [skills, sortField, sortDirection]
  );

  const hasExplicitSelection = selectedSlugs.size > 0;

  const exportRows = useMemo(() => {
    if (!hasExplicitSelection) {
      return auditRows;
    }
    return auditRows.filter((row) => selectedSlugs.has(row.slug));
  }, [auditRows, hasExplicitSelection, selectedSlugs]);

  const allVisibleSelected =
    auditRows.length > 0 && auditRows.every((row) => selectedSlugs.has(row.slug));
  const someVisibleSelected = auditRows.some((row) => selectedSlugs.has(row.slug));

  useEffect(() => {
    const input = selectAllRef.current;
    if (input) {
      input.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [allVisibleSelected, someVisibleSelected]);

  function toggleSlug(slug: string, checked: boolean) {
    setSelectedSlugs((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(slug);
      } else {
        next.delete(slug);
      }
      return next;
    });
  }

  function setAllVisibleSelected(checked: boolean) {
    const visibleSlugs = auditRows.map((row) => row.slug);
    setSelectedSlugs((current) => {
      const next = new Set(current);
      for (const slug of visibleSlugs) {
        if (checked) {
          next.add(slug);
        } else {
          next.delete(slug);
        }
      }
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      setError(null);
      setSkills([]);
      setDetailOffset(0);
      setSelectedSlugs(new Set());
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
    if (exportRows.length === 0) {
      return;
    }
    setExporting("csv");
    try {
      downloadAuditCsv(exportRows);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportXlsx() {
    if (exportRows.length === 0) {
      return;
    }
    setExporting("xlsx");
    try {
      await downloadAuditXlsx(exportRows);
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
            <p>按 Skill 汇总最新版本的发布时间与 SkillSpector 安全分（100 − 风险分）、HaluCatch 质量分。</p>
          </div>
          <div className="stats-card hero-card">
            <div className="stat-grid">
              <Stat label="已加载" value={auditRows.length} />
              <Stat label="已勾选" value={selectedSlugs.size} />
              <Stat label="将导出" value={exportRows.length} />
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
                <p>
                  与下方表格列一致，可排序。未勾选任何行时导出当前已加载的全部记录；有勾选时仅导出已勾选行。
                </p>
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
                  disabled={loading || exportRows.length === 0 || exporting !== null}
                  onClick={() => void handleExportCsv()}
                  type="button"
                >
                  <Download size={15} />
                  {exporting === "csv" ? "导出中…" : "导出 CSV"}
                </button>
                <button
                  className="button secondary compact"
                  disabled={loading || exportRows.length === 0 || exporting !== null}
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
                      <th className="audit-table-select-col" scope="col">
                        <input
                          aria-label="全选当前列表"
                          checked={allVisibleSelected}
                          className="audit-row-checkbox"
                          onChange={(event) => setAllVisibleSelected(event.target.checked)}
                          ref={selectAllRef}
                          type="checkbox"
                        />
                      </th>
                      <th scope="col">排序</th>
                      <th scope="col">skill_name</th>
                      <th scope="col">creator</th>
                      <th scope="col">version</th>
                      <th scope="col">publish_date</th>
                      <th scope="col">skillspector_safety_score</th>
                      <th scope="col">halucatch_score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((row, index) => (
                      <AuditTableRow
                        key={row.slug}
                        onToggle={(checked) => toggleSlug(row.slug, checked)}
                        rank={index + 1}
                        row={row}
                        selected={selectedSlugs.has(row.slug)}
                      />
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

function AuditTableRow({
  rank,
  row,
  selected,
  onToggle
}: {
  rank: number;
  row: AuditRow;
  selected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <tr>
      <td className="audit-table-select-col">
        <input
          aria-label={`选择 ${row.skillName}`}
          checked={selected}
          className="audit-row-checkbox"
          onChange={(event) => onToggle(event.target.checked)}
          type="checkbox"
        />
      </td>
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
      <td>{formatScore(row.skillSpectorSafetyScore)}</td>
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

function formatScore(score: number | null): string {
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
