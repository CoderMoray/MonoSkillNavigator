"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Download, MessageSquare, Plus, Star, Users } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { ScoreBars } from "../../../components/ScoreBars";
import { EvaluationBadge, SeverityBadge, VerdictBadge } from "../../../components/StatusBadge";
import { addSkillContributor, getSkill } from "../../../lib/api";
import { getAuthToken } from "../../../lib/auth-token";
import { formatDateTime, formatNumber } from "../../../lib/format";
import type { RegistryContributor, RegistrySkill } from "../../../lib/types";

export default function SkillDetailPage() {
  const params = useParams<{ name: string }>();
  const skillName = decodeURIComponent(params.name);
  const [skill, setSkill] = useState<RegistrySkill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contributorName, setContributorName] = useState("");
  const [contributorRole, setContributorRole] = useState<RegistryContributor["role"]>("contributor");
  const [contributorMessage, setContributorMessage] = useState<string | null>(null);
  const [contributorError, setContributorError] = useState<string | null>(null);
  const [addingContributor, setAddingContributor] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getSkill(skillName);
        if (!cancelled) {
          setSkill(data);
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
  }, [skillName]);

  const latest = useMemo(() => {
    if (!skill) {
      return undefined;
    }
    return skill.versions[skill.latestVersion];
  }, [skill]);

  if (loading) {
    return (
      <AppShell title={skillName}>
        <div className="loading-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="skeleton" key={index} />
          ))}
        </div>
      </AppShell>
    );
  }

  if (error || !skill || !latest) {
    return (
      <AppShell title={skillName}>
        <div className="error">{error ?? "Skill 不存在"}</div>
      </AppShell>
    );
  }

  const tags = latest.manifest.tags ?? [];
  const installCommand = `npm run skill -- install ${skill.name}`;

  async function handleAddContributor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setContributorError(null);
    setContributorMessage(null);

    const token = getAuthToken();
    if (!token) {
      setContributorError("请先登录后再添加 contributor。");
      return;
    }
    if (!skill) {
      setContributorError("Skill 数据尚未加载完成。");
      return;
    }

    const name = contributorName.trim();
    if (!name) {
      setContributorError("请输入 contributor 用户名。");
      return;
    }

    setAddingContributor(true);
    try {
      const contributor = await addSkillContributor(token, skill.name, name, contributorRole);
      setSkill((current) => {
        if (!current) {
          return current;
        }

        const contributors = current.contributors.some((item) => item.id === contributor.id)
          ? current.contributors.map((item) => (item.id === contributor.id ? contributor : item))
          : [...current.contributors, contributor];

        return {
          ...current,
          contributors
        };
      });
      setContributorName("");
      setContributorRole("contributor");
      setContributorMessage(`已添加 ${contributor.name} 为 ${contributor.role}`);
    } catch (err) {
      setContributorError(err instanceof Error ? err.message : "添加 contributor 失败");
    } finally {
      setAddingContributor(false);
    }
  }

  return (
    <AppShell title={skill.name}>
      <div className="page-stack">
        <Link className="button secondary" href="/skills" style={{ width: "fit-content" }}>
          <ArrowLeft size={16} /> 返回 Skill 广场
        </Link>

        <section className="hero">
          <div className="hero-card">
            <div className="card-head">
              <span className="eyebrow">Skill Detail</span>
              <VerdictBadge verdict={latest.status} />
            </div>
            <h1>{skill.name}</h1>
            <p>{skill.description}</p>
            <div className="tag-row">
              <span className="badge">v{skill.latestVersion}</span>
              <span className="badge">
                <Star size={13} /> {skill.averageRating ? skill.averageRating.toFixed(1) : "暂无评分"}
              </span>
              <span className="badge">
                <Download size={13} /> {formatNumber(latest.downloads)} downloads
              </span>
              <span className="badge">
                <MessageSquare size={13} /> {skill.issues.filter((issue) => issue.status !== "closed").length} open
              </span>
            </div>
            {tags.length > 0 ? (
              <div className="tag-row">
                {tags.map((tag) => (
                  <span className="badge" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="stats-card hero-card">
            <ScoreBars scores={latest.review.scores} />
          </div>
        </section>

        <section className="two-column">
          <div className="card">
            <h2>审查报告</h2>
            <p className="description">
              审查于 {formatDateTime(latest.review.createdAt)} 完成，内容 hash 为{" "}
              <span className="mono">{latest.contentHash.slice(0, 16)}...</span>
            </p>
            {latest.review.findings.length === 0 ? (
              <div className="empty" style={{ marginTop: 16 }}>
                未发现风险项。
              </div>
            ) : (
              <ul className="list" style={{ marginTop: 16 }}>
                {latest.review.findings.map((finding) => (
                  <li className={`list-item finding ${finding.severity}`} key={finding.id}>
                    <div className="card-head">
                      <strong>{finding.title}</strong>
                      <SeverityBadge severity={finding.severity} />
                    </div>
                    <p className="description">{finding.message}</p>
                    <p className="description">建议：{finding.recommendation}</p>
                    {finding.evidence ? <pre className="pre">{finding.evidence}</pre> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className="card">
            <h2>安装</h2>
            <p className="description">在 API 服务运行时，可以通过 CLI 安装最新版本。</p>
            <pre className="pre">{installCommand}</pre>
            <div className="tag-row">
              <span className="badge">
                <Copy size={13} /> 可复制命令
              </span>
            </div>
          </aside>
        </section>

        <section className="two-column">
          <div className="card">
            <div className="card-head">
              <h2>功能性评估</h2>
              {latest.evaluation ? <EvaluationBadge status={latest.evaluation.status} /> : null}
            </div>
            {latest.evaluation ? (
              <>
                <p className="description">
                  Provider: {latest.evaluation.provider} · Score {latest.evaluation.score} · Tasks{" "}
                  {latest.evaluation.tasksPassed}/{latest.evaluation.tasksTotal}
                </p>
                <ul className="list" style={{ marginTop: 16 }}>
                  {latest.evaluation.taskResults.map((task) => (
                    <li className="list-item" key={task.name}>
                      <strong>{task.name}</strong>
                      <p className="description">Score {task.score}</p>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="empty">该版本暂无功能性评估报告。</div>
            )}
          </div>

          <div className="card">
            <h2>贡献者</h2>
            <form className="contributor-form" onSubmit={handleAddContributor}>
              <label className="field">
                <span>用户名</span>
                <input
                  onChange={(event) => setContributorName(event.target.value)}
                  placeholder="输入已注册用户名，例如 bob"
                  value={contributorName}
                />
              </label>
              <label className="field">
                <span>角色</span>
                <select
                  className="select contributor-select"
                  onChange={(event) => setContributorRole(event.target.value as RegistryContributor["role"])}
                  value={contributorRole}
                >
                  <option value="contributor">contributor</option>
                  <option value="reviewer">reviewer</option>
                  <option value="maintainer">maintainer</option>
                  <option value="owner">owner</option>
                </select>
              </label>
              {contributorMessage ? <div className="notice">{contributorMessage}</div> : null}
              {contributorError ? <div className="error compact-error">{contributorError}</div> : null}
              <button className="button primary" disabled={addingContributor} type="submit">
                <Plus size={15} />
                {addingContributor ? "添加中..." : "添加 contributor"}
              </button>
            </form>
            <ul className="list">
              {skill.contributors.map((contributor) => (
                <li className="list-item" key={contributor.id}>
                  <Users size={15} /> <strong>{contributor.name}</strong>
                  <p className="description">
                    {contributor.role} · {formatDateTime(contributor.addedAt)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="card">
          <h2>Issue 与评分</h2>
          <div className="two-column">
            <div>
              <h3>Issues</h3>
              {skill.issues.length === 0 ? (
                <div className="empty">暂无 issue。</div>
              ) : (
                <ul className="list">
                  {skill.issues.map((issue) => (
                    <li className={`list-item finding ${issue.severity}`} key={issue.id}>
                      <div className="card-head">
                        <strong>{issue.title}</strong>
                        <SeverityBadge severity={issue.severity} />
                      </div>
                      <p className="description">
                        {issue.type} · {issue.status} · {issue.createdBy ?? "anonymous"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3>Ratings</h3>
              {skill.ratings.length === 0 ? (
                <div className="empty">暂无评分。</div>
              ) : (
                <ul className="list">
                  {skill.ratings.map((rating) => (
                    <li className="list-item" key={rating.id}>
                      <strong>{rating.score}/5 · {rating.user}</strong>
                      {rating.comment ? <p className="description">{rating.comment}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
