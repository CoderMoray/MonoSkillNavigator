"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChangeEvent, DragEvent, FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, CheckCircle2, ChevronDown, KeyRound, UploadCloud } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { ScoreBars } from "../../../components/ScoreBars";
import { EvaluationBadge, VerdictBadge } from "../../../components/StatusBadge";
import {
  getCurrentUser,
  getSkill,
  publishSkillArchive,
  type PublishSkillMetadata,
  type PublishSkillResponse
} from "../../../lib/api";
import { getAuthToken } from "../../../lib/auth-token";
import type { PublicUser, RegistrySkill } from "../../../lib/types";

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

const MAX_CATEGORIES = 3;

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export default function PublishSkillPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Publish">
          <div className="skeleton" />
        </AppShell>
      }
    >
      <PublishSkillPageContent />
    </Suspense>
  );
}

function PublishSkillPageContent() {
  const searchParams = useSearchParams();
  const sourceSlug = searchParams.get("skill")?.trim() ?? "";
  const isNewVersion = Boolean(sourceSlug);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [sourceSkill, setSourceSkill] = useState<RegistrySkill | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [topics, setTopics] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [releaseTags, setReleaseTags] = useState("latest");
  const [changelog, setChangelog] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingSource, setLoadingSource] = useState(Boolean(sourceSlug));
  const [sourceError, setSourceError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!sourceSlug) {
      setSourceSkill(null);
      setSourceError(null);
      setLoadingSource(false);
      return;
    }

    let cancelled = false;
    setLoadingSource(true);
    setSourceError(null);

    async function loadSourceSkill() {
      try {
        const skill = await getSkill(sourceSlug);
        if (cancelled) {
          return;
        }

        const latest = skill.versions[skill.latestVersion];
        setSourceSkill(skill);
        setDisplayName(skill.name);
        setSlug(skill.slug);
        setSummary(skill.description);
        setCategories((latest?.manifest.categories ?? []).slice(0, MAX_CATEGORIES));
        setTopics((latest?.manifest.topics ?? []).join(", "));
        setVersion(suggestNextPatchVersion(skill.latestVersion));
        setReleaseTags(latest?.releaseTags.join(", ") || "latest");
        setChangelog("");
      } catch (err) {
        if (!cancelled) {
          setSourceError(err instanceof Error ? err.message : "加载 Skill 失败");
        }
      } finally {
        if (!cancelled) {
          setLoadingSource(false);
        }
      }
    }

    void loadSourceSkill();
    return () => {
      cancelled = true;
    };
  }, [sourceSlug]);

  useEffect(() => {
    if (!categoryMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!categoryMenuRef.current?.contains(event.target as Node)) {
        setCategoryMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCategoryMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [categoryMenuOpen]);

  const isOwner = Boolean(
    user &&
      sourceSkill &&
      (sourceSkill.ownerUserId === user.id ||
        sourceSkill.contributors.some(
          (contributor) =>
            contributor.role === "owner" &&
            (contributor.userId === user.id || contributor.username === user.username)
        ))
  );

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
          splitList(releaseTags).length > 0 &&
          (!isNewVersion || isOwner)
      ),
    [categories.length, displayName, file, isNewVersion, isOwner, releaseTags, slug, summary, version]
  );

  function selectArchive(fileToUpload: File | null) {
    setResult(null);
    if (!fileToUpload) {
      setError(null);
      setFile(null);
      syncFileInput(null);
      return;
    }
    if (!fileToUpload.name.toLowerCase().endsWith(".zip")) {
      setError("当前页面仅支持上传 .zip 包。文件夹发布可使用 CLI。");
      setFile(null);
      syncFileInput(null);
      return;
    }

    setError(null);
    setFile(fileToUpload);
    syncFileInput(fileToUpload);
  }

  function syncFileInput(fileToUpload: File | null) {
    const input = fileInputRef.current;
    if (!input) {
      return;
    }
    const transfer = new DataTransfer();
    if (fileToUpload) {
      transfer.items.add(fileToUpload);
    }
    input.files = transfer.files;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectArchive(event.target.files?.[0] ?? null);
  }

  function handleFileDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (event.dataTransfer.types.includes("Files")) {
      setIsDraggingFile(true);
    }
  }

  function handleFileDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleFileDragLeave(event: DragEvent<HTMLLabelElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingFile(false);
    }
  }

  function handleFileDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingFile(false);
    selectArchive(event.dataTransfer.files.item(0));
  }

  function toggleCategory(option: string) {
    setError(null);
    setCategories((current) => {
      if (current.includes(option)) {
        return current.filter((item) => item !== option);
      }
      if (current.length >= MAX_CATEGORIES) {
        setError(`最多只能选择 ${MAX_CATEGORIES} 个分类。`);
        return current;
      }
      return [...current, option];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const token = getAuthToken();
    if (!token || !user) {
      setError(isNewVersion ? "请先登录后再发布新版本" : "请先登录后再添加 Skill");
      return;
    }

    if (isNewVersion && !isOwner) {
      setError("只有该 Skill 的 owner 可以发布新版本。");
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
      const published = await publishSkillArchive(token, archiveBase64, metadata, isNewVersion ? changelog : undefined);
      setResult(published);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title={isNewVersion ? "New version" : "Publish"}>
      <div className="market-stack">
        <section className="section-head">
          <div>
            <span className="eyebrow publish-eyebrow">{isNewVersion ? "Publish New Version" : "Publish Skill"}</span>
            <h2 style={{ marginTop: 14 }}>
              {isNewVersion ? `发布 ${sourceSkill?.name ?? "Skill"} 的新版本` : "添加 Skill"}
            </h2>
            <p>
              {isNewVersion
                ? "上传新的 zip 包，可填写 Changelog；平台会自动解包、审查、评估并归档该版本。"
                : "上传 zip 包后，平台会自动解包、审查、评估，并绑定到当前登录用户。"}
            </p>
          </div>
        </section>

        {loadingUser || loadingSource ? (
          <div className="skeleton" />
        ) : !user ? (
          <section className="auth-card card">
            <span className="eyebrow">
              <KeyRound size={14} />
              Login required
            </span>
            <h1>请先登录</h1>
            <p className="description">
              {isNewVersion ? "发布新版本需要以该 Skill 的 owner 身份登录。" : "发布 Skill 需要登录，发布者会自动成为该 Skill 的 owner。"}
            </p>
            <div className="hero-actions">
              <Link className="button primary" href="/login">登录</Link>
              <Link className="button secondary" href="/register">注册</Link>
            </div>
          </section>
        ) : sourceError ? (
          <section className="error">无法加载要发布新版本的 Skill：{sourceError}</section>
        ) : isNewVersion && !isOwner ? (
          <section className="auth-card card">
            <span className="eyebrow">
              <KeyRound size={14} />
              Owner required
            </span>
            <h1>无权发布新版本</h1>
            <p className="description">只有该 Skill 的 owner 可以从此页面发布新版本。</p>
            <div className="hero-actions">
              <Link className="button secondary" href={`/skills/${encodeURIComponent(sourceSlug)}`}>
                返回 Skill 详情
              </Link>
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

                  <div className="publish-field-with-hint">
                    <label className="field">
                      <span>Slug <em>必填</em></span>
                      <input
                        maxLength={64}
                        onChange={(event) => setSlug(event.target.value)}
                        pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                        placeholder="例如 github-issue-triage"
                        readOnly={isNewVersion}
                        required
                        value={slug}
                      />
                    </label>
                    <small>
                      {isNewVersion ? "新版本沿用原 Skill 的不可变 Slug。" : "仅小写字母、数字和短横线；发布后不可修改。"}
                    </small>
                  </div>
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
                  <div className="field publish-category-field" ref={categoryMenuRef}>
                    <span>Categories <em>必填</em></span>
                    <button
                      aria-expanded={categoryMenuOpen}
                      aria-haspopup="listbox"
                      className={`publish-category-trigger ${categoryMenuOpen ? "open" : ""}`}
                      onClick={() => setCategoryMenuOpen((open) => !open)}
                      type="button"
                    >
                      {categories.length > 0 ? (
                        <span className="publish-category-selected">
                          {categories.map((item) => (
                            <span className="badge" key={item}>{item}</span>
                          ))}
                        </span>
                      ) : (
                        <span className="publish-category-placeholder">请选择分类</span>
                      )}
                      <ChevronDown className={`publish-category-chevron ${categoryMenuOpen ? "open" : ""}`} size={16} />
                    </button>
                    {categoryMenuOpen ? (
                      <div aria-multiselectable="true" className="publish-category-menu" role="listbox">
                        {CATEGORY_OPTIONS.map((option) => {
                          const selected = categories.includes(option);
                          const disabled = !selected && categories.length >= MAX_CATEGORIES;
                          return (
                            <button
                              aria-selected={selected}
                              className={`publish-category-option ${selected ? "selected" : ""}`}
                              disabled={disabled}
                              key={option}
                              onClick={() => toggleCategory(option)}
                              role="option"
                              type="button"
                            >
                              <span>{option}</span>
                              {selected ? <Check size={15} /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    <small>最多可选择 {MAX_CATEGORIES} 个分类。</small>
                  </div>

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

                {isNewVersion ? (
                  <label className="field">
                    <span>Changelog <i>选填</i></span>
                    <textarea
                      maxLength={10_000}
                      onChange={(event) => setChangelog(event.target.value)}
                      placeholder="说明此版本新增、变更、修复或不兼容的内容"
                      rows={6}
                      value={changelog}
                    />
                    <small>发布后会显示在该版本的详情中，最多 10,000 个字符。</small>
                  </label>
                ) : null}

                <label
                  className={`upload-dropzone ${file ? "selected" : ""} ${isDraggingFile ? "dragging" : ""}`}
                  onDragEnter={handleFileDragEnter}
                  onDragLeave={handleFileDragLeave}
                  onDragOver={handleFileDragOver}
                  onDrop={handleFileDrop}
                >
                  <UploadCloud size={28} />
                  <strong>{fileLabel}</strong>
                  <span>拖拽 .zip 包到此处，或点击选择。压缩包根目录须包含 `SKILL.md`，随后会写入发布信息并进行审查和归档。</span>
                  <input
                    accept=".zip,application/zip"
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    required
                    type="file"
                  />
                </label>

                {error ? <div className="error compact-error">{error}</div> : null}

                <button className="button primary" disabled={submitting || !canPublish} type="submit">
                  {submitting ? "发布并审查中..." : isNewVersion ? "发布新版本" : "发布 Skill"}
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
    categories: [...new Set(input.categories.map((item) => item.trim()).filter(Boolean))].slice(0, MAX_CATEGORIES),
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
  if (metadata.categories.length > MAX_CATEGORIES) {
    return `Category 最多选择 ${MAX_CATEGORIES} 个。`;
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

function suggestNextPatchVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    return "1.0.0";
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
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
