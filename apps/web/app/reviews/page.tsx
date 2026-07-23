"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { ScoreRadar } from "../../components/ScoreRadar";
import { EvaluationBadge, SeverityBadge, VerdictBadge } from "../../components/StatusBadge";
import { getSkill, getSkills } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { averageReviewScores } from "../../lib/review-scores";
import type { RegistrySkill, ReviewFinding, ReviewScores } from "../../lib/types";

interface AggregatedFinding {
  finding: ReviewFinding;
  skillSlug: string;
  skillName: string;
  version: string;
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

  const reviewStats = useMemo(() => {
    const versions = skills
      .map((skill) => skill.versions[skill.latestVersion])
      .filter((version): version is NonNullable<typeof version> => Boolean(version));
    const findings: AggregatedFinding[] = skills.flatMap((skill) => {
      const latest = skill.versions[skill.latestVersion];
      if (!latest) {
        return [];
      }
      return latest.review.findings.map((finding) => ({
        finding,
        skillSlug: skill.slug,
        skillName: skill.name,
        version: latest.version
      }));
    });
    const blockers = findings.filter(
      ({ finding }) => finding.severity === "critical" || finding.severity === "high"
    ).length;
    const passed = versions.filter((version) => version.status === "published").length;
    const averageReliability =
      versions.length === 0
        ? 0
        : Math.round(
            versions.reduce((total, version) => total + version.review.scores.reliabilityScore, 0) / versions.length
          );

    return { versions: versions.length, findings, blockers, passed, averageReliability };
  }, [skills]);

  const platformAverageScores = useMemo<ReviewScores | undefined>(() => {
    const items = skills
      .map((skill) => skill.versions[skill.latestVersion])
      .filter((version): version is NonNullable<typeof version> => Boolean(version))
      .map((version) => ({ scores: version.review.scores }));
    return averageReviewScores(items);
  }, [skills]);

  const platformSampleSize = useMemo(
    () =>
      skills.filter((skill) => skill.versions[skill.latestVersion]).length,
    [skills]
  );

  return (
    <AppShell title="审查中心">
      <div className="page-stack">
        <section className="hero">
          <div className="hero-card">
            <span className="eyebrow">
              <ShieldCheck size={14} />
              Review Center
            </span>
            <h1>审查、评分和可靠性评估集中视图。</h1>
            <p>
              这里聚合最新版本的审查结果，帮助你快速定位高风险 finding、确认发布状态，并查看可靠性证据是否完善。
            </p>
          </div>
          <div className="stats-card hero-card">
            <div className="stat-grid">
              <Stat label="版本数" value={reviewStats.versions} />
              <Stat label="已发布" value={reviewStats.passed} />
              <Stat label="阻断项" value={reviewStats.blockers} />
              <Stat label="平均可靠性" value={reviewStats.averageReliability} />
            </div>
          </div>
        </section>

        {error ? <div className="error">{error}。请确认 API 已通过 npm run dev:api 启动。</div> : null}

        {loading ? (
          <div className="loading-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="skeleton" key={index} />
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="empty">暂无审查数据。可以先发布 demo skill。</div>
        ) : (
          <section className="two-column">
            <div className="card">
              <h2>最新版本审查</h2>
              <ul className="list">
                {skills.map((skill) => {
                  const latest = skill.versions[skill.latestVersion];
                  if (!latest) {
                    return null;
                  }

                  return (
                    <li className="list-item" key={skill.slug}>
                      <div className="card-head">
                        <div>
                          <Link href={`/skills/${encodeURIComponent(skill.slug)}`}>
                            <strong>{skill.name}</strong>
                          </Link>
                          <p className="description">
                            v{latest.version} · {formatDateTime(latest.review.createdAt)}
                          </p>
                        </div>
                        <div className="tag-row" style={{ marginTop: 0 }}>
                          <VerdictBadge verdict={latest.status} />
                          {latest.evaluation ? <EvaluationBadge status={latest.evaluation.status} /> : null}
                        </div>
                      </div>
                      <div style={{ marginTop: 16 }}>
                        <ScoreRadar
                          averageScores={platformAverageScores}
                          sampleSize={platformSampleSize}
                          scores={latest.review.scores}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="card">
              <h2>风险 Finding</h2>
              {reviewStats.findings.length === 0 ? (
                <div className="empty">
                  <CheckCircle2 size={18} color="var(--green)" /> 当前没有 finding。
                </div>
              ) : (
                <ul className="list">
                  {reviewStats.findings.slice(0, 12).map((item) => (
                    <FindingItem
                      finding={item.finding}
                      key={`${item.skillSlug}:${item.finding.id}`}
                      skillName={item.skillName}
                      skillSlug={item.skillSlug}
                      version={item.version}
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        <section className="card">
          <div className="section-head">
            <div>
              <h2>审查规则摘要</h2>
              <p>当前审查引擎以静态扫描为主，可靠性评估来自 HaluCatch，必要时回退到 tests/*.json 任务集。</p>
            </div>
            <ShieldAlert color="var(--amber)" />
          </div>
          <ul className="list" style={{ marginTop: 18 }}>
            <li className="list-item">
              <ShieldCheck size={16} color="var(--green)" /> Critical / High finding 会阻断发布。
            </li>
            <li className="list-item">
              <Activity size={16} color="var(--blue)" /> 可靠性分来自 HaluCatch 五维静态评估，并结合任务集、示例和验收证据。
            </li>
            <li className="list-item">
              <ShieldAlert size={16} color="var(--amber)" /> 网络、凭证、危险命令、持久化、混淆代码会被重点标记。
            </li>
          </ul>
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

function FindingItem({
  finding,
  skillName,
  skillSlug,
  version
}: {
  finding: ReviewFinding;
  skillName: string;
  skillSlug: string;
  version: string;
}) {
  return (
    <li className={`list-item finding ${finding.severity}`}>
      <div className="card-head">
        <strong>{finding.title}</strong>
        <SeverityBadge severity={finding.severity} />
      </div>
      <p className="description">
        <Link href={`/skills/${encodeURIComponent(skillSlug)}`}>{skillName}</Link>
        {" · "}v{version}
      </p>
      <p className="description">{finding.message}</p>
    </li>
  );
}
