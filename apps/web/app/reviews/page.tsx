"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { getSkill, getSkills } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { FunctionalEvaluationReport, RegistrySkill } from "../../lib/types";

interface AuditRow {
  slug: string;
  skillName: string;
  creatorLabel: string;
  creatorHandle?: string;
  version: string;
  publishDate: string;
  skillSpectorRiskScore: number | null;
  haluCatchScore: number | null;
}

export default function ReviewsPage() {
  const [skills, setSkills] = useState<RegistrySkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const auditRows = useMemo(() => {
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

    return rows.sort((left, right) => right.publishDate.localeCompare(left.publishDate));
  }, [skills]);

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
                    <tr key={row.slug}>
                      <td className="audit-table-rank">{index + 1}</td>
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <p className="stat-value">{value}</p>
      <p className="stat-label">{label}</p>
    </div>
  );
}

function resolveHaluCatchScore(evaluation: FunctionalEvaluationReport | undefined): number | null {
  if (!evaluation || evaluation.provider !== "halucatch-adapter") {
    return null;
  }
  return evaluation.score;
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
