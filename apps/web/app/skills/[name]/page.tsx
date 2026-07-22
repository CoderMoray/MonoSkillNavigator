"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { isSkillEntryPath } from "@skill-platform/skill-spec/skill-format";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileCode2,
  FileText,
  Files,
  Gauge,
  History,
  MessageSquare,
  Package,
  Plus,
  ShieldCheck,
  Star,
  Users,
  X
} from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { ScoreBars } from "../../../components/ScoreBars";
import { EvaluationBadge, SeverityBadge, VerdictBadge } from "../../../components/StatusBadge";
import { addSkillContributor, addSkillRating, createSkillIssue, getCurrentUser, getSkill } from "../../../lib/api";
import { getAuthToken } from "../../../lib/auth-token";
import { formatDateTime, formatNumber } from "../../../lib/format";
import type { PublicUser, RegistryContributor, RegistryIssue, RegistrySkill } from "../../../lib/types";

type DetailPanel =
  | "skill-md"
  | "skill-card"
  | "files"
  | "versions"
  | "review"
  | "evaluation"
  | "community";

interface DetailCard {
  id: DetailPanel;
  title: string;
  icon: LucideIcon;
  meta: string;
}

function asList(value?: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

export default function SkillDetailPage() {
  const params = useParams<{ name: string }>();
  const skillSlug = decodeURIComponent(params.name);
  const [skill, setSkill] = useState<RegistrySkill | null>(null);
  const [viewer, setViewer] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<DetailPanel>("skill-md");
  const [selectedVersionName, setSelectedVersionName] = useState<string | null>(null);
  const [expandedVersionNames, setExpandedVersionNames] = useState<Set<string>>(() => new Set());
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [contributorName, setContributorName] = useState("");
  const [contributorRole, setContributorRole] = useState<RegistryContributor["role"]>("contributor");
  const [contributorMessage, setContributorMessage] = useState<string | null>(null);
  const [contributorError, setContributorError] = useState<string | null>(null);
  const [addingContributor, setAddingContributor] = useState(false);
  const [issueType, setIssueType] = useState<RegistryIssue["type"]>("bug");
  const [issueSeverity, setIssueSeverity] = useState<RegistryIssue["severity"]>("medium");
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [issueMessage, setIssueMessage] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [submittingIssue, setSubmittingIssue] = useState(false);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingMessage, setRatingMessage] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = getAuthToken();
        const [data, currentUser] = await Promise.all([
          getSkill(skillSlug),
          token ? getCurrentUser(token).catch(() => null) : Promise.resolve(null)
        ]);
        if (!cancelled) {
          setSkill(data);
          setViewer(currentUser);
          setSelectedVersionName(data.latestVersion);
          setExpandedVersionNames(new Set());
          setSelectedFilePath(null);
          setActivePanel("skill-md");
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
  }, [skillSlug]);

  useEffect(() => {
    if (!issueModalOpen && !ratingModalOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIssueModalOpen(false);
        setRatingModalOpen(false);
        setIssueError(null);
        setRatingError(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [issueModalOpen, ratingModalOpen]);

  const currentVersion = useMemo(() => {
    if (!skill) {
      return undefined;
    }
    return (selectedVersionName ? skill.versions[selectedVersionName] : undefined) ?? skill.versions[skill.latestVersion];
  }, [selectedVersionName, skill]);

  const versions = useMemo(
    () => (skill ? Object.values(skill.versions).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []),
    [skill]
  );

  if (loading) {
    return (
      <AppShell title={skillSlug}>
        <div className="loading-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="skeleton" key={index} />
          ))}
        </div>
      </AppShell>
    );
  }

  if (error || !skill || !currentVersion) {
    return (
      <AppShell title={skillSlug}>
        <div className="error">{error ?? "Skill 不存在"}</div>
      </AppShell>
    );
  }

  const snapshot = currentVersion.snapshot;
  const files = snapshot?.files ?? [];
  const skillMdFile = files.find((file) => isSkillEntryPath(file.path));
  const skillEntryLabel = skillMdFile?.path ?? "SKILL.md";
  const markdownContent = snapshot?.readme?.trim() || stripFrontmatter(skillMdFile?.content ?? "");
  const selectedFile = files.find((file) => file.path === selectedFilePath) ?? files[0];
  const isOwner = Boolean(
    viewer &&
      (skill.ownerUserId === viewer.id ||
        skill.contributors.some(
          (contributor) =>
            contributor.role === "owner" &&
            (contributor.userId === viewer.id || contributor.username === viewer.username)
        ))
  );
  const tags = currentVersion.manifest.tags ?? [];
  const openIssues = skill.issues.filter((issue) => issue.status !== "closed");
  const reviewFindings = currentVersion.review?.findings ?? [];
  const requirementGroups = [
    {
      title: "支持的 Agent",
      values: asList(currentVersion.manifest.supportedAgents),
      empty: "未声明支持的 Agent。"
    },
    {
      title: "允许的工具",
      values: asList(currentVersion.manifest["allowed-tools"]),
      empty: "未声明工具白名单。"
    },
    {
      title: "禁用的工具",
      values: asList(currentVersion.manifest["disallowed-tools"]),
      empty: "未声明工具限制。"
    }
  ];
  const detailCards: DetailCard[] = [
    {
      id: "skill-md",
      title: skillEntryLabel,
      icon: BookOpen,
      meta: markdownContent ? `${markdownContent.split(/\r?\n/).length} 行` : "暂无内容"
    },
    {
      id: "skill-card",
      title: "Skill Card",
      icon: Package,
      meta: `v${currentVersion.version}`
    },
    {
      id: "files",
      title: "Files",
      icon: Files,
      meta: `${files.length} 个文件`
    },
    {
      id: "versions",
      title: "Versions",
      icon: History,
      meta: `${versions.length} 个版本`
    },
    {
      id: "review",
      title: "审查报告",
      icon: ShieldCheck,
      meta: `${reviewFindings.length} 项发现`
    },
    {
      id: "evaluation",
      title: "功能评估",
      icon: Gauge,
      meta: currentVersion.evaluation
        ? `${currentVersion.evaluation.tasksPassed}/${currentVersion.evaluation.tasksTotal} 通过`
        : "未配置"
    },
    {
      id: "community",
      title: "Issue 与评分",
      icon: MessageSquare,
      meta: `${openIssues.length} 个开放 Issue`
    }
  ];
  const installCommand = `npm run skill -- install ${skill.slug}`;

  function openIssueModal() {
    setIssueError(null);
    setIssueModalOpen(true);
  }

  function closeIssueModal() {
    setIssueModalOpen(false);
    setIssueError(null);
  }

  function openRatingModal() {
    setRatingError(null);
    setRatingModalOpen(true);
  }

  function closeRatingModal() {
    setRatingModalOpen(false);
    setRatingError(null);
  }

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
      const contributor = await addSkillContributor(token, skill.slug, name, contributorRole);
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

  async function handleSubmitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIssueError(null);
    setIssueMessage(null);

    const token = getAuthToken();
    if (!token) {
      setIssueError("请先登录后再提交 Issue。");
      return;
    }
    if (!skill) {
      setIssueError("Skill 数据尚未加载完成。");
      return;
    }

    const title = issueTitle.trim();
    if (!title) {
      setIssueError("请填写 Issue 标题。");
      return;
    }

    setSubmittingIssue(true);
    try {
      const issue = await createSkillIssue(token, skill.slug, {
        type: issueType,
        severity: issueSeverity,
        title,
        body: issueBody.trim() || undefined
      });
      setSkill((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          issues: [issue, ...current.issues]
        };
      });
      setIssueTitle("");
      setIssueBody("");
      setIssueType("bug");
      setIssueSeverity("medium");
      setIssueModalOpen(false);
      setIssueMessage("Issue 已提交。");
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : "提交 Issue 失败");
    } finally {
      setSubmittingIssue(false);
    }
  }

  async function handleSubmitRating(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRatingError(null);
    setRatingMessage(null);

    const token = getAuthToken();
    if (!token) {
      setRatingError("请先登录后再评分。");
      return;
    }
    if (!skill || !currentVersion) {
      setRatingError("Skill 数据尚未加载完成。");
      return;
    }
    if (ratingScore < 1 || ratingScore > 5) {
      setRatingError("请选择 1 到 5 星的评分。");
      return;
    }

    setSubmittingRating(true);
    try {
      const result = await addSkillRating(token, skill.slug, {
        score: ratingScore,
        version: currentVersion.version,
        comment: ratingComment.trim() || undefined
      });
      setSkill((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          ratings: [result.rating, ...current.ratings],
          averageRating: result.averageRating,
          ratingCount: result.ratingCount
        };
      });
      setRatingScore(0);
      setRatingComment("");
      setRatingModalOpen(false);
      setRatingMessage("评分已提交。");
    } catch (err) {
      setRatingError(err instanceof Error ? err.message : "提交评分失败");
    } finally {
      setSubmittingRating(false);
    }
  }

  return (
    <AppShell title={skill.name}>
      <div className="page-stack">
        <Link className="button secondary" href="/skills" style={{ width: "fit-content" }}>
          <ArrowLeft size={16} /> 返回 Skill 广场
        </Link>

        <section className="hero skill-detail-hero">
          <div className="hero-card">
            <div className="card-head">
              <span className="eyebrow">Skill Detail</span>
              <VerdictBadge verdict={currentVersion.status} />
            </div>
            <h1>{skill.name}</h1>
            <p>{skill.description}</p>
            <div className="tag-row">
              <span className="badge mono">{skill.slug}</span>
              <span className="badge">v{currentVersion.version}</span>
              <span className="badge">
                <Star size={13} /> {skill.averageRating ? skill.averageRating.toFixed(1) : "暂无评分"}
              </span>
              <span className="badge">
                <Download size={13} /> {formatNumber(currentVersion.downloads)} downloads
              </span>
              <span className="badge">
                <MessageSquare size={13} /> {openIssues.length} open
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
            {isOwner ? (
              <div className="hero-actions">
                <Link className="button primary" href={`/skills/publish?skill=${encodeURIComponent(skill.slug)}`}>
                  <Plus size={16} /> 发布新版本
                </Link>
              </div>
            ) : null}
          </div>

          <aside className="hero-card detail-summary-card">
            <span className="eyebrow">当前查看版本</span>
            <strong className="detail-version-value">v{currentVersion.version}</strong>
            <p className="description">发布于 {formatDateTime(currentVersion.createdAt)}</p>
            <div className="stat-grid">
              <div className="stat">
                <p className="stat-value">{files.length}</p>
                <p className="stat-label">Files</p>
              </div>
              <div className="stat">
                <p className="stat-value">{versions.length}</p>
                <p className="stat-label">Versions</p>
              </div>
              <div className="stat">
                <p className="stat-value">{openIssues.length}</p>
                <p className="stat-label">Open issues</p>
              </div>
              <div className="stat">
                <p className="stat-value">{skill.ratingCount}</p>
                <p className="stat-label">Ratings</p>
              </div>
            </div>
          </aside>
        </section>

        <section className="skill-detail-navigation" aria-label="Skill 内容">
          <div className="section-head">
            <div>
              <h2>Skill 内容</h2>
              <p>在横栏中切换文档、版本与审查信息。</p>
            </div>
          </div>
          <div className="detail-tab-bar" role="tablist" aria-label="Skill 详情">
            {detailCards.map((detailCard) => {
              const Icon = detailCard.icon;
              const isActive = activePanel === detailCard.id;

              return (
                <button
                  aria-controls="skill-detail-panel"
                  aria-selected={isActive}
                  className={`detail-tab ${isActive ? "active" : ""}`}
                  id={`detail-tab-${detailCard.id}`}
                  key={detailCard.id}
                  onClick={() => setActivePanel(detailCard.id)}
                  role="tab"
                  type="button"
                >
                  <Icon size={16} />
                  <span>{detailCard.title}</span>
                  <small>{detailCard.meta}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby={`detail-tab-${activePanel}`}
          className="card detail-panel"
          id="skill-detail-panel"
          role="tabpanel"
        >
          {activePanel === "skill-md" ? (
            <>
              <div className="detail-panel-head">
                <div>
                  <span className="eyebrow">Document</span>
                  <h2>{skillEntryLabel}</h2>
                  <p className="description">渲染当前版本的 Skill 说明文档。</p>
                </div>
                {skillMdFile ? <span className="badge mono">{formatFileSize(skillMdFile.size)}</span> : null}
              </div>
              {markdownContent ? (
                <div className="markdown-content">
                  <ReactMarkdown>{markdownContent}</ReactMarkdown>
                </div>
              ) : (
                <div className="empty detail-empty">当前版本没有可渲染的 Skill 入口文件内容。</div>
              )}
            </>
          ) : null}

          {activePanel === "skill-card" ? (
            <>
              <div className="detail-panel-head">
                <div>
                  <span className="eyebrow">Overview</span>
                  <h2>Skill Card</h2>
                  <p className="description">汇总发布元信息、安装方式和贡献者。</p>
                </div>
                <VerdictBadge verdict={currentVersion.status} />
              </div>
              <div className="two-column detail-split">
                <div className="detail-section">
                  <div className="detail-meta-grid">
                    <div>
                      <span>Slug</span>
                      <strong className="mono">{skill.slug}</strong>
                    </div>
                    <div>
                      <span>Version</span>
                      <strong>v{currentVersion.version}</strong>
                    </div>
                    <div>
                      <span>Author</span>
                      <strong>{currentVersion.manifest.author ?? "未声明"}</strong>
                    </div>
                    <div>
                      <span>License</span>
                      <strong>{currentVersion.manifest.license ?? "未声明"}</strong>
                    </div>
                  </div>

                  <div className="detail-subsection">
                    <h3>安装</h3>
                    <p className="description">在 API 服务运行时，可以通过 CLI 安装最新版本。</p>
                    <pre className="pre">{installCommand}</pre>
                    <div className="tag-row">
                      <span className="badge">
                        <Copy size={13} /> 可复制命令
                      </span>
                      {currentVersion.releaseTags.map((releaseTag) => (
                        <span className="badge" key={releaseTag}>
                          {releaseTag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <aside className="detail-side-section">
                  <div className="card-head">
                    <h3>贡献者</h3>
                    <span className="badge">{skill.contributors.length}</span>
                  </div>
                  {viewer ? (
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
                  ) : (
                    <div className="empty detail-empty">
                      <p className="description">添加 contributor 需要先登录。</p>
                      <div className="hero-actions">
                        <Link className="button primary" href="/login">登录</Link>
                      </div>
                    </div>
                  )}
                  {skill.contributors.length === 0 ? (
                    <div className="empty detail-empty">暂无贡献者信息。</div>
                  ) : (
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
                  )}
                </aside>
              </div>
              <div className="detail-subsection skill-card-requirements">
                <div className="card-head">
                  <div>
                    <h3>Requirements</h3>
                    <p className="description">此版本在 Skill 入口文件 frontmatter 中声明的运行边界。</p>
                  </div>
                  <span className="badge">
                    {requirementGroups.filter((group) => group.values.length > 0).length}/{requirementGroups.length} 已声明
                  </span>
                </div>
                <div className="requirements-grid">
                  {requirementGroups.map((group) => (
                    <section className="requirement-card" key={group.title}>
                      <h3>{group.title}</h3>
                      {group.values.length > 0 ? (
                        <div className="tag-row">
                          {group.values.map((value) => (
                            <span className="badge" key={value}>
                              {value}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="description">{group.empty}</p>
                      )}
                    </section>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {activePanel === "files" ? (
            <>
              <div className="detail-panel-head">
                <div>
                  <span className="eyebrow">Package</span>
                  <h2>Files</h2>
                  <p className="description">选择文件即可预览当前版本归档中的文本内容。</p>
                </div>
                <span className="badge">{files.length} 个文件</span>
              </div>
              {files.length === 0 ? (
                <div className="empty detail-empty">当前版本没有可浏览的文件。</div>
              ) : (
                <div className="file-browser">
                  <div className="file-list" aria-label="文件列表">
                    {files.map((file) => {
                      const isSelected = file.path === selectedFile?.path;
                      return (
                        <button
                          aria-pressed={isSelected}
                          className={`file-row ${isSelected ? "active" : ""}`}
                          key={file.path}
                          onClick={() => setSelectedFilePath(file.path)}
                          type="button"
                        >
                          <FileText size={16} />
                          <span>
                            <strong>{file.path}</strong>
                            <small>{formatFileSize(file.size)}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="file-preview">
                    {selectedFile ? (
                      <>
                        <div className="file-preview-head">
                          <div>
                            <div className="file-preview-title">
                              <FileCode2 size={17} />
                              <strong>{selectedFile.path}</strong>
                            </div>
                            <span className="mono">sha256 {selectedFile.sha256.slice(0, 16)}...</span>
                          </div>
                          <span className="badge">{formatFileSize(selectedFile.size)}</span>
                        </div>
                        <pre className="pre">{selectedFile.content}</pre>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          ) : null}

          {activePanel === "versions" ? (
            <>
              <div className="detail-panel-head">
                <div>
                  <span className="eyebrow">Release history</span>
                  <h2>Versions</h2>
                  <p className="description">点击版本可独立展开或收起 Changelog，并同步更新其他卡片。</p>
                </div>
                <span className="badge">{versions.length} 个版本</span>
              </div>
              <div className="version-list">
                {versions.map((version) => {
                  const isSelected = version.version === currentVersion.version;
                  const isExpanded = expandedVersionNames.has(version.version);
                  return (
                    <div className={`version-entry ${isExpanded ? "active" : ""}`} key={version.version}>
                      <button
                        aria-expanded={isExpanded}
                        aria-pressed={isSelected}
                        className={`version-row ${isSelected ? "active" : ""}`}
                        onClick={() => {
                          setSelectedVersionName(version.version);
                          setSelectedFilePath(null);
                          setExpandedVersionNames((expanded) => {
                            const next = new Set(expanded);
                            if (next.has(version.version)) {
                              next.delete(version.version);
                            } else {
                              next.add(version.version);
                            }
                            return next;
                          });
                        }}
                        type="button"
                      >
                        <span className="version-row-main">
                          <span className="version-name-row">
                            <strong>v{version.version}</strong>
                            {version.version === skill.latestVersion ? <span className="badge">latest</span> : null}
                          </span>
                          <span>{formatDateTime(version.createdAt)}</span>
                        </span>
                        <span className="version-row-meta">
                          <span>
                            <Download size={13} /> {formatNumber(version.downloads)}
                          </span>
                          <VerdictBadge verdict={version.status} />
                          {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                        </span>
                      </button>
                      {isExpanded ? (
                        <div className="version-changelog">
                          <div className="changelog-content">{version.changelog?.trim() || "未提供 Changelog"}</div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {activePanel === "review" ? (
            <>
              <div className="detail-panel-head">
                <div>
                  <span className="eyebrow">Audit</span>
                  <h2>审查报告</h2>
                  <p className="description">
                    审查于 {currentVersion.review?.createdAt ? formatDateTime(currentVersion.review.createdAt) : "未知时间"} 完成，
                    内容 hash 为 <span className="mono">{currentVersion.contentHash.slice(0, 16)}...</span>
                  </p>
                </div>
                <VerdictBadge verdict={currentVersion.status} />
              </div>
              {currentVersion.review?.scores ? (
                <div className="review-score-card">
                  <ScoreBars scores={currentVersion.review.scores} />
                </div>
              ) : null}
              {reviewFindings.length === 0 ? (
                <div className="empty detail-empty">未发现风险项。</div>
              ) : (
                <ul className="list detail-list">
                  {reviewFindings.map((finding) => (
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
            </>
          ) : null}

          {activePanel === "evaluation" ? (
            <>
              <div className="detail-panel-head">
                <div>
                  <span className="eyebrow">Functional check</span>
                  <h2>功能评估</h2>
                  <p className="description">查看功能性任务集的完成情况与发现。</p>
                </div>
                {currentVersion.evaluation ? <EvaluationBadge status={currentVersion.evaluation.status} /> : null}
              </div>
              {currentVersion.evaluation ? (
                <>
                  <div className="evaluation-summary">
                    <div>
                      <span>Provider</span>
                      <strong>{currentVersion.evaluation.provider}</strong>
                    </div>
                    <div>
                      <span>Score</span>
                      <strong>{currentVersion.evaluation.score}</strong>
                    </div>
                    <div>
                      <span>Tasks</span>
                      <strong>
                        {currentVersion.evaluation.tasksPassed}/{currentVersion.evaluation.tasksTotal}
                      </strong>
                    </div>
                    <div>
                      <span>评估时间</span>
                      <strong>{formatDateTime(currentVersion.evaluation.createdAt)}</strong>
                    </div>
                  </div>
                  {currentVersion.evaluation.taskResults.length > 0 ? (
                    <div className="detail-subsection">
                      <h3>任务结果</h3>
                      <ul className="list">
                        {currentVersion.evaluation.taskResults.map((task) => (
                          <li className="list-item" key={task.name}>
                            <div className="card-head">
                              <strong>{task.name}</strong>
                              <span className="badge">Score {task.score}</span>
                            </div>
                            {task.findings.map((finding) => (
                              <p className="description" key={finding.id}>
                                {finding.message}
                              </p>
                            ))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {currentVersion.evaluation.findings.length > 0 ? (
                    <div className="detail-subsection">
                      <h3>总体发现</h3>
                      <ul className="list">
                        {currentVersion.evaluation.findings.map((finding) => (
                          <li className={`list-item finding ${finding.severity}`} key={finding.id}>
                            <div className="card-head">
                              <strong>{finding.task ?? "功能性检查"}</strong>
                              <SeverityBadge severity={finding.severity} />
                            </div>
                            <p className="description">{finding.message}</p>
                            <p className="description">建议：{finding.recommendation}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="empty detail-empty">该版本暂无功能性评估报告。</div>
              )}
            </>
          ) : null}

          {activePanel === "community" ? (
            <>
              <div className="detail-panel-head">
                <div>
                  <span className="eyebrow">Community feedback</span>
                  <h2>Issue 与评分</h2>
                  <p className="description">登录后可提交 Issue 与评分，并查看社区反馈。</p>
                </div>
                <span className="badge">
                  <Star size={13} /> {skill.averageRating ? skill.averageRating.toFixed(1) : "暂无评分"} · {skill.ratingCount}
                </span>
              </div>
              <div className="two-column detail-split">
                <div className="detail-section">
                  <div className="card-head">
                    <h3>Issues</h3>
                    <div className="card-head-actions">
                      <span className="badge">{skill.issues.length}</span>
                      {viewer ? (
                        <button className="button secondary compact" onClick={openIssueModal} type="button">
                          <Plus size={14} /> 提交 Issue
                        </button>
                      ) : (
                        <Link className="button secondary compact" href="/login">登录后提交</Link>
                      )}
                    </div>
                  </div>
                  {issueMessage ? <div className="notice">{issueMessage}</div> : null}
                  {skill.issues.length === 0 ? (
                    <div className="empty detail-empty">暂无 issue。</div>
                  ) : (
                    <ul className="list">
                      {skill.issues.map((issue) => (
                        <li className={`list-item finding ${issue.severity}`} key={issue.id}>
                          <div className="card-head">
                            <strong>{issue.title}</strong>
                            <SeverityBadge severity={issue.severity} />
                          </div>
                          <p className="description">
                            {issue.type} · {issue.status} · {issue.createdBy ?? "anonymous"} ·{" "}
                            {formatDateTime(issue.createdAt)}
                          </p>
                          {issue.body ? <p className="description">{issue.body}</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <aside className="detail-side-section">
                  <div className="card-head">
                    <h3>Ratings</h3>
                    <div className="card-head-actions">
                      <span className="badge">{skill.ratingCount}</span>
                      {viewer ? (
                        <button className="button secondary compact" onClick={openRatingModal} type="button">
                          <Star size={14} /> 提交评分
                        </button>
                      ) : (
                        <Link className="button secondary compact" href="/login">登录后提交</Link>
                      )}
                    </div>
                  </div>
                  {ratingMessage ? <div className="notice">{ratingMessage}</div> : null}
                  {skill.ratings.length === 0 ? (
                    <div className="empty detail-empty">暂无评分。</div>
                  ) : (
                    <ul className="list">
                      {skill.ratings.map((rating) => (
                        <li className="list-item" key={rating.id}>
                          <strong>
                            {rating.score}/5 · {rating.user}
                          </strong>
                          <p className="description">
                            {rating.version ? `v${rating.version} · ` : ""}
                            {formatDateTime(rating.createdAt)}
                          </p>
                          {rating.comment ? <p className="description">{rating.comment}</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </aside>
              </div>
            </>
          ) : null}
        </section>

        {issueModalOpen ? (
          <div
            className="modal-overlay"
            onClick={closeIssueModal}
            role="presentation"
          >
            <div
              aria-labelledby="issue-modal-title"
              aria-modal="true"
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-head">
                <div>
                  <span className="eyebrow">Submit issue</span>
                  <h3 id="issue-modal-title">提交 Issue</h3>
                </div>
                <button aria-label="关闭" className="modal-close" onClick={closeIssueModal} type="button">
                  <X size={18} />
                </button>
              </div>
              <form className="modal-form" onSubmit={handleSubmitIssue}>
                <div className="publish-form-grid">
                  <label className="field">
                    <span>类型</span>
                    <select
                      className="contributor-select"
                      onChange={(event) => setIssueType(event.target.value as RegistryIssue["type"])}
                      value={issueType}
                    >
                      <option value="bug">bug</option>
                      <option value="security">security</option>
                      <option value="compatibility">compatibility</option>
                      <option value="feature">feature</option>
                      <option value="docs">docs</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>严重程度</span>
                    <select
                      className="contributor-select"
                      onChange={(event) => setIssueSeverity(event.target.value as RegistryIssue["severity"])}
                      value={issueSeverity}
                    >
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                      <option value="critical">critical</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>标题</span>
                  <input
                    maxLength={256}
                    onChange={(event) => setIssueTitle(event.target.value)}
                    placeholder="简要描述问题"
                    required
                    value={issueTitle}
                  />
                </label>
                <label className="field">
                  <span>详情 <i>选填</i></span>
                  <textarea
                    maxLength={4096}
                    onChange={(event) => setIssueBody(event.target.value)}
                    placeholder="补充复现步骤、期望行为或影响范围"
                    rows={4}
                    value={issueBody}
                  />
                </label>
                {issueError ? <div className="error compact-error">{issueError}</div> : null}
                <div className="modal-actions">
                  <button className="button secondary" onClick={closeIssueModal} type="button">
                    取消
                  </button>
                  <button className="button primary" disabled={submittingIssue} type="submit">
                    {submittingIssue ? "提交中..." : "确认提交"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {ratingModalOpen ? (
          <div
            className="modal-overlay"
            onClick={closeRatingModal}
            role="presentation"
          >
            <div
              aria-labelledby="rating-modal-title"
              aria-modal="true"
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-head">
                <div>
                  <span className="eyebrow">Submit rating</span>
                  <h3 id="rating-modal-title">提交评分</h3>
                </div>
                <button aria-label="关闭" className="modal-close" onClick={closeRatingModal} type="button">
                  <X size={18} />
                </button>
              </div>
              <form className="modal-form" onSubmit={handleSubmitRating}>
                <label className="field">
                  <span>评分</span>
                  <div aria-label="选择 1 到 5 星" className="rating-stars" role="group">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        aria-label={`${score} 星`}
                        aria-pressed={ratingScore === score}
                        className={`rating-star ${ratingScore >= score ? "active" : ""}`}
                        key={score}
                        onClick={() => setRatingScore(score)}
                        type="button"
                      >
                        <Star fill={ratingScore >= score ? "currentColor" : "none"} size={24} />
                      </button>
                    ))}
                  </div>
                  <small>当前版本：v{currentVersion.version}</small>
                </label>
                <label className="field">
                  <span>评论 <i>选填</i></span>
                  <textarea
                    maxLength={1024}
                    onChange={(event) => setRatingComment(event.target.value)}
                    placeholder="分享使用体验或改进建议"
                    rows={4}
                    value={ratingComment}
                  />
                </label>
                {ratingError ? <div className="error compact-error">{ratingError}</div> : null}
                <div className="modal-actions">
                  <button className="button secondary" onClick={closeRatingModal} type="button">
                    取消
                  </button>
                  <button className="button primary" disabled={submittingRating || ratingScore === 0} type="submit">
                    {submittingRating ? "提交中..." : "确认提交"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
