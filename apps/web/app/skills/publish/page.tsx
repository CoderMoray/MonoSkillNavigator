"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, KeyRound, UploadCloud } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { ScoreBars } from "../../../components/ScoreBars";
import { EvaluationBadge, VerdictBadge } from "../../../components/StatusBadge";
import {
  getCurrentUser,
  publishSkillArchive,
  type PublishSkillMetadata,
  type PublishSkillResponse
} from "../../../lib/api";
import { getAuthToken } from "../../../lib/auth-token";
import type { PublicUser } from "../../../lib/types";

const CATEGORY_OPTIONS = [
  "Automation",
  "Developer Tools",
  "Documentation",
  "Productivity",
  "Data & Analytics",
  "Security",
  "Design & Creative",
  "Communication"
];

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export default function PublishSkillPage() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [topics, setTopics] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [releaseTags, setReleaseTags] = useState("latest");
  const [loadingUser, setLoadingUser] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublishSkillResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const token = getAuthToken();
      if (!token) {
        setLoadingUser(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser(token);
        if (!cancelled) {
          setUser(currentUser);
        }
      } finally {
        if (!cancelled) {
          setLoadingUser(false);
        }
      }
    }

    void loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const fileLabel = useMemo(() => {
    if (!file) {
      return "选择 .zip Skill 包";
    }
    return `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
  }, [file]);

  const canPublish = useMemo(
    () =>
      Boolean(
        file &&
          displayName.trim() &&
          slug.trim() &&
          summary.trim().length >= 20 &&
          categories.length > 0 &&
          SEMVER_PATTERN.test(version.trim()) &&
          splitList(releaseTags).length > 0
      ),
    [categories.length, displayName, file, releaseTags, slug, summary, version]
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setResult(null);
    setError(null);
    setFile(event.target.files?.[0] ?? null);
  }

  function handleCategoryChange(event: ChangeEvent<HTMLSelectElement>) {
    setError(null);
    setCategories(Array.from(event.currentTarget.selectedOptions, (option) => option.value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const token = getAuthToken();
    if (!token || !user) {
      setError("请先登录后再添加 Skill");
      return;
    }

    if (!file) {
      setError("请先选择一个 .zip Skill 包");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("当前页面仅支持上传 .zip 包。文件夹发布可使用 CLI。");
      return;
    }

    const metadata = createPublishMetadata({
      displayName,
      slug,
      summary,
      categories,
      topics,
      version,
      releaseTags
    });
    const metadataError = validatePublishMetadata(metadata);
    if (metadataError) {
      setError(metadataError);
      return;
    }

    setSubmitting(true);
    try {
      const archiveBase64 = await readFileAsBase64(file);
      const published = await publishSkillArchive(token, archiveBase64, metadata);
      setResult(published);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="Publish">
      <div className="market-stack">
        <section className="section-head">
          <div>
            <span className="eyebrow publish-eyebrow">Publish Skill</span>
            <h2 style={{ marginTop: 14 }}>添加 Skill</h2>
            <p>上传 zip 包后，平台会自动解包、审查、评估，并绑定到当前登录用户。</p>
          </div>
        </section>

        {loadingUser ? (
          <div className="skeleton" />
        ) : !user ? (
          <section className="auth-card card">
            <span className="eyebrow">
              <KeyRound size={14} />
              Login required
            </span>
            <h1>请先登录</h1>
            <p className="description">发布 Skill 需要登录，发布者会自动成为该 Skill 的 owner。</p>
            <div className="hero-actions">
              <Link className="button primary" href="/login">登录</Link>
              <Link className="button secondary" href="/register">注册</Link>
            </div>
          </section>
        ) : (
          <section className="market-panel">
            <div className="profile-content publish-content">
              <form className="publish-form" onSubmit={handleSubmit}>
                <div className="publish-form-grid">
                  <label className="field">
                    <span>Display Name <em>必填</em></span>
                    <input
                      maxLength={128}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="例如 GitHub Issue Triage"
                      required
                      value={displayName}
                    />
                  </label>

                  <label className="field">
                    <span>Slug <em>必填</em></span>
                    <input
                      maxLength={64}
                      onChange={(event) => setSlug(event.target.value)}
                      pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                      placeholder="例如 github-issue-triage"
                      required
                      value={slug}
                    />
                    <small>仅小写字母、数字和短横线；发布后不可修改。</small>
                  </label>
                </div>

                <label className="field">
                  <span>Summary <em>必填</em></span>
                  <textarea
                    maxLength={1024}
                    minLength={20}
                    onChange={(event) => setSummary(event.target.value)}
                    placeholder="说明 Skill 能做什么、适用于什么场景（至少 20 个字符）"
                    required
                    rows={4}
                    value={summary}
                  />
                </label>

                <div className="publish-form-grid">
                  <label className="field">
                    <span>Categories <em>必填</em></span>
                    <select
                      className="publish-category-select"
                      multiple
                      onChange={handleCategoryChange}
                      required
                      value={categories}
                    >
                      {CATEGORY_OPTIONS.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    <small>可选择多个分类；Windows 使用 Ctrl，macOS 使用 Command。</small>
                  </label>

                  <label className="field">
                    <span>Topics <i>选填</i></span>
                    <input
                      maxLength={1024}
                      onChange={(event) => setTopics(event.target.value)}
                      placeholder="例如 github, issues, automation"
                      value={topics}
                    />
                    <small>使用逗号分隔，每项最多 64 个字符。</small>
                  </label>
                </div>

                <div className="publish-form-grid">
                  <label className="field">
                    <span>Version <em>必填</em></span>
                    <input
                      onChange={(event) => setVersion(event.target.value)}
                      pattern="(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?"
                      placeholder="1.0.0"
                      required
                      value={version}
                    />
                    <small>采用 SemVer 格式，例如 1.0.0。</small>
                  </label>

                  <label className="field">
                    <span>Release Tags <em>必填</em></span>
                    <input
                      onChange={(event) => setReleaseTags(event.target.value)}
                      placeholder="latest"
                      required
                      value={releaseTags}
                    />
                    <small>使用逗号分隔；新版本会接管同名 Release Tag。</small>
                  </label>
                </div>

                <label className={`upload-dropzone ${file ? "selected" : ""}`}>
                  <UploadCloud size={28} />
                  <strong>{fileLabel}</strong>
                  <span>选择包含根目录 `SKILL.md` 的 zip 包。以上发布信息会写入包内 frontmatter，再进行审查和归档。</span>
                  <input accept=".zip,application/zip" onChange={handleFileChange} required type="file" />
                </label>

                {error ? <div className="error compact-error">{error}</div> : null}

                <button className="button primary" disabled={submitting || !canPublish} type="submit">
                  {submitting ? "发布并审查中..." : "发布 Skill"}
                  <ArrowRight size={16} />
                </button>
              </form>

              <div className="publish-cli-card">
                <strong>也可以使用 CLI 发布文件夹或 zip：</strong>
                <pre>{`$ npm run skill -- publish ./my-skill --token <token>
$ npm run skill -- publish ./my-skill.zip --token <token>`}</pre>
              </div>
            </div>
          </section>
        )}

        {result ? (
          <section className="market-panel">
            <div className="section-head">
              <div>
                <span className="eyebrow">
                  <CheckCircle2 size={14} />
                  Published
                </span>
                <h2 style={{ marginTop: 14 }}>{result.name}@{result.version}</h2>
                <p className="description">slug：<span className="mono">{result.slug}</span></p>
                <p className="description">Release Tags：{result.releaseTags.join(", ")}</p>
                <p>内容 hash：<span className="mono">{result.contentHash.slice(0, 16)}...</span></p>
              </div>
              <VerdictBadge verdict={result.review.verdict} />
            </div>

            <div className="two-column" style={{ marginTop: 18 }}>
              <div className="card">
                <h2>审查分数</h2>
                <ScoreBars scores={result.review.scores} />
              </div>
              <div className="card">
                <h2>功能评估</h2>
                {result.evaluation ? (
                  <>
                    <EvaluationBadge status={result.evaluation.status} />
                    <p className="description">
                      Score {result.evaluation.score} · Tasks {result.evaluation.tasksPassed}/{result.evaluation.tasksTotal}
                    </p>
                  </>
                ) : (
                  <p className="description">暂无功能评估。</p>
                )}
                <div className="hero-actions">
                  <Link className="button secondary" href={`/skills/${encodeURIComponent(result.slug)}`}>
                    查看详情
                  </Link>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function createPublishMetadata(input: {
  displayName: string;
  slug: string;
  summary: string;
  categories: string[];
  topics: string;
  version: string;
  releaseTags: string;
}): PublishSkillMetadata {
  return {
    displayName: input.displayName.trim(),
    slug: input.slug.trim(),
    summary: input.summary.trim(),
    categories: [...new Set(input.categories.map((category) => category.trim()).filter(Boolean))],
    topics: splitList(input.topics),
    version: input.version.trim(),
    releaseTags: splitList(input.releaseTags).map((tag) => tag.toLowerCase())
  };
}

function validatePublishMetadata(metadata: PublishSkillMetadata): string | undefined {
  if (!metadata.displayName) {
    return "请填写 Display Name。";
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(metadata.slug) || metadata.slug.length > 64) {
    return "Slug 仅可包含小写字母、数字和短横线，且最长为 64 个字符。";
  }
  if (metadata.summary.length < 20) {
    return "Summary 至少需要 20 个字符。";
  }
  if (metadata.categories.length === 0) {
    return "请至少选择一个 Category。";
  }
  if (metadata.topics.length > 20 || metadata.topics.some((topic) => topic.length > 64)) {
    return "Topics 最多 20 个，且每项最长 64 个字符。";
  }
  if (!SEMVER_PATTERN.test(metadata.version)) {
    return "Version 必须采用 SemVer 格式，例如 1.0.0。";
  }
  if (metadata.releaseTags.length === 0) {
    return "请至少填写一个 Release Tag。";
  }
  if (metadata.releaseTags.some((tag) => !/^[a-z0-9][a-z0-9._-]*$/.test(tag) || tag.length > 64)) {
    return "Release Tags 仅可包含小写字母、数字、点、下划线和短横线。";
  }
  return undefined;
}

function splitList(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",").at(-1) ?? "" : value);
    };
    reader.readAsDataURL(file);
  });
}
