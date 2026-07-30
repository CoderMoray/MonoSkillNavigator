"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, DragEvent, FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, KeyRound, UploadCloud } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { SuccessToast } from "../../../components/SuccessToast";
import {
  getCurrentUser,
  getSkill,
  previewSkillArchive,
  publishSkillArchive,
  type PublishSkillFrontmatter,
  type PublishSkillMetadata
} from "../../../lib/api";
import { savePublishNotice } from "../../../lib/publish-notice";
import { getAuthToken } from "../../../lib/auth-token";
import { creatorProfilePath } from "../../../lib/creators";
import { readSkillFrontmatterFromZip } from "../../../lib/parse-skill-archive";
import {
  buildSkillZipFileFromBrowserFiles,
  findDroppedZipFile,
  isZipFile,
  relativeFilesFromDataTransferItems,
  relativeFilesFromFileList
} from "../../../lib/build-skill-zip";
import type { PublicUser, RegistrySkill } from "../../../lib/types";
import { compareSemver, SKILL_ENTRY_BASENAMES, validatePublishMetadataInput } from "@skill-platform/skill-spec/skill-format";
import { isSkillContributor } from "../../../lib/skill-contributors";
import { SKILL_CATEGORY_OPTIONS } from "../../../lib/skill-categories";

const CATEGORY_OPTIONS = [...SKILL_CATEGORY_OPTIONS];

const MAX_CATEGORIES = 3;

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
  const folderInputRef = useRef<HTMLInputElement>(null);
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
  const [archiveHint, setArchiveHint] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [parsingArchive, setParsingArchive] = useState(false);
  const [existingSkillBySlug, setExistingSkillBySlug] = useState<RegistrySkill | null>(null);
  const [loadingExistingSlug, setLoadingExistingSlug] = useState(false);
  const [slugPermissionError, setSlugPermissionError] = useState<string | null>(null);
  const router = useRouter();

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
        const token = getAuthToken();
        const skill = await getSkill(sourceSlug, token ?? undefined);
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
    if (isNewVersion) {
      setExistingSkillBySlug(null);
      setLoadingExistingSlug(false);
      return;
    }

    const normalizedSlug = slug.trim();
    if (!normalizedSlug || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(normalizedSlug)) {
      setExistingSkillBySlug(null);
      setLoadingExistingSlug(false);
      return;
    }

    let cancelled = false;
    const token = getAuthToken();
    setLoadingExistingSlug(true);
    const timeout = window.setTimeout(() => {
      void getSkill(normalizedSlug, token ?? undefined)
        .then((skill) => {
          if (!cancelled) {
            setExistingSkillBySlug(skill);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setExistingSkillBySlug(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingExistingSlug(false);
          }
        });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      setLoadingExistingSlug(false);
    };
  }, [isNewVersion, slug]);

  useEffect(() => {
    if (isNewVersion) {
      if (!sourceSkill || loadingUser) {
        return;
      }
      if (!user) {
        setSlugPermissionError(null);
        return;
      }
      setSlugPermissionError(
        isSkillContributor(sourceSkill, user) ? null : "你没有权限向该 Skill 发布新版本。"
      );
      return;
    }

    const normalizedSlug = slug.trim();
    if (!normalizedSlug || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(normalizedSlug)) {
      setSlugPermissionError(null);
      return;
    }

    if (loadingExistingSlug) {
      return;
    }

    if (!existingSkillBySlug) {
      setSlugPermissionError(null);
      return;
    }

    if (!user) {
      setSlugPermissionError("该 Slug 已被使用，请先登录以确认是否有权发布新版本。");
      return;
    }

    setSlugPermissionError(
      isSkillContributor(existingSkillBySlug, user)
        ? null
        : "你没有权限向该 Skill 发布新版本，请联系 contributor。"
    );
  }, [existingSkillBySlug, isNewVersion, loadingExistingSlug, loadingUser, slug, sourceSkill, user]);

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

  const canPublishToSkill = Boolean(
    user &&
      (isNewVersion
        ? sourceSkill && isSkillContributor(sourceSkill, user)
        : !existingSkillBySlug || isSkillContributor(existingSkillBySlug, user))
  );

  const slugStatusMessage = useMemo(() => {
    if (slugPermissionError) {
      return slugPermissionError;
    }
    if (!isNewVersion && loadingExistingSlug) {
      return "正在检查 Slug 是否可用…";
    }
    if (!isNewVersion && existingSkillBySlug && user && isSkillContributor(existingSkillBySlug, user)) {
      return `该 Slug 已存在，将为此 Skill 发布新版本（当前最新 v${existingSkillBySlug.latestVersion}）。`;
    }
    return null;
  }, [existingSkillBySlug, isNewVersion, loadingExistingSlug, slugPermissionError, user]);

  const fileLabel = useMemo(() => {
    if (parsingArchive) {
      return "正在打包并解析 Skill…";
    }
    if (!file) {
      return "选择 Skill 文件夹或 .zip 包";
    }
    return `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
  }, [file, parsingArchive]);

  const showPublishForm = Boolean(file && !parsingArchive);

  const skillForVersionCheck = isNewVersion ? sourceSkill : existingSkillBySlug;

  const publishBlockReason = useMemo(() => {
    if (!showPublishForm) {
      return null;
    }
    if (slugPermissionError) {
      return slugPermissionError;
    }
    if ((isNewVersion && sourceSkill) || existingSkillBySlug) {
      if (!user) {
        return "请先登录后再发布。";
      }
      if (!canPublishToSkill) {
        return "你没有权限向该 Skill 发布新版本。";
      }
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
      return metadataError;
    }

    return getVersionConflictMessage(skillForVersionCheck, metadata.version);
  }, [
    categories,
    displayName,
    canPublishToSkill,
    existingSkillBySlug,
    isNewVersion,
    releaseTags,
    showPublishForm,
    skillForVersionCheck,
    slug,
    slugPermissionError,
    sourceSkill,
    summary,
    topics,
    user,
    version
  ]);

  const canPublish = publishBlockReason === null;

  async function applyArchiveFile(fileToUpload: File) {
    setError(null);
    setArchiveHint(null);
    setSuccessToast(null);
    setFile(fileToUpload);

    try {
      const frontmatter = await loadFrontmatterFromArchive(fileToUpload);
      const filledFields = applyFrontmatterToForm(frontmatter, isNewVersion, {
        setDisplayName,
        setSlug,
        setSummary,
        setVersion,
        setCategories,
        setTopics
      });

      if (filledFields.length > 0) {
        setSuccessToast(`已从 Skill 入口文件自动填入：${filledFields.join("、")}。`);
      } else {
        setArchiveHint("已上传 Skill 包，但未读取到可用的 frontmatter 字段。");
      }
    } catch (err) {
      setArchiveHint(
        err instanceof Error ? `已上传 Skill 包，但无法解析 Skill 入口文件：${err.message}` : "已上传 Skill 包，但无法解析 Skill 入口文件。"
      );
    }
  }

  async function ingestUpload(options: {
    zipFile?: File | null;
    folderFileList?: FileList | null;
    dataTransfer?: DataTransfer | null;
  }) {
    setError(null);
    setArchiveHint(null);
    setSuccessToast(null);

    if (!options.zipFile && !options.folderFileList?.length && !options.dataTransfer?.items.length) {
      setFile(null);
      return;
    }

    setParsingArchive(true);
    try {
      let archiveFile: File | null = options.zipFile ?? null;

      if (!archiveFile && options.folderFileList?.length) {
        archiveFile = await buildSkillZipFileFromBrowserFiles(relativeFilesFromFileList(options.folderFileList));
      }

      if (!archiveFile && options.dataTransfer) {
        archiveFile = findDroppedZipFile(options.dataTransfer);

        if (!archiveFile) {
          const relativeFiles = await relativeFilesFromDataTransferItems(options.dataTransfer.items);
          if (relativeFiles.length === 1 && isZipFile(relativeFiles[0]!.file)) {
            archiveFile = relativeFiles[0]!.file;
          } else if (relativeFiles.length > 0) {
            archiveFile = await buildSkillZipFileFromBrowserFiles(relativeFiles);
          } else {
            const dropped = options.dataTransfer.files.item(0);
            if (dropped && isZipFile(dropped)) {
              archiveFile = dropped;
            }
          }
        }
      }

      if (!archiveFile) {
        setError("请上传 Skill 文件夹或 .zip 包。");
        setFile(null);
        return;
      }

      if (!isZipFile(archiveFile)) {
        setError("仅支持 Skill 文件夹或 .zip 包。");
        setFile(null);
        return;
      }

      await applyArchiveFile(archiveFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取 Skill 包");
      setFile(null);
    } finally {
      setParsingArchive(false);
    }
  }

  async function selectArchive(fileToUpload: File | null) {
    await ingestUpload({ zipFile: fileToUpload });
  }

  function handleFolderChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files;
    void ingestUpload({ folderFileList: selected });
    event.target.value = "";
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    void selectArchive(selected);
    event.target.value = "";
  }

  function handleFileDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.dataTransfer.types.includes("Files")) {
      setIsDraggingFile(true);
    }
  }

  function handleFileDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleFileDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingFile(false);
    }
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingFile(false);
    void ingestUpload({ dataTransfer: event.dataTransfer });
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

    const token = getAuthToken();
    if (!token || !user) {
      setError(isNewVersion ? "请先登录后再发布新版本" : "请先登录后再添加 Skill");
      return;
    }

    if (slugPermissionError) {
      setError(slugPermissionError);
      return;
    }

    if ((isNewVersion && sourceSkill) || existingSkillBySlug) {
      if (!canPublishToSkill) {
        setError("你没有权限向该 Skill 发布新版本。");
        return;
      }
    }

    if (!file) {
      setError("请先选择 Skill 文件夹或 .zip 包");
      return;
    }

    if (!isZipFile(file)) {
      setError("请重新选择有效的 Skill 包");
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

    const versionConflict = getVersionConflictMessage(skillForVersionCheck, metadata.version);
    if (versionConflict) {
      setError(versionConflict);
      return;
    }

    setSubmitting(true);
    try {
      const archiveBase64 = await readFileAsBase64(file);
      const published = await publishSkillArchive(token, archiveBase64, metadata, isNewVersion ? changelog : undefined);
      savePublishNotice({
        slug: published.slug,
        name: published.name,
        version: published.version,
        verdict: published.review.verdict,
        isNewVersion
      });
      router.push(user ? creatorProfilePath(user.username) : "/account");
    } catch (err) {
      const message = err instanceof Error ? err.message : "发布失败";
      setError(formatPublishError(message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title={isNewVersion ? "New version" : "Publish"}>
      {successToast ? <SuccessToast message={successToast} onClose={() => setSuccessToast(null)} /> : null}
      <div className="market-stack">
        <section className="section-head">
          <div>
            <span className="eyebrow publish-eyebrow">{isNewVersion ? "Publish New Version" : "Publish Skill"}</span>
            <h2 style={{ marginTop: 14 }}>
              {isNewVersion ? `发布 ${sourceSkill?.name ?? "Skill"} 的新版本` : "添加 Skill"}
            </h2>
            <p>
              {isNewVersion
                ? "先上传新的 Skill 文件夹或 zip 包，确认发布信息后再提交审查与归档。"
                : "上传 Skill 文件夹或 .zip 包，平台会自动解析 Skill 入口文件并填入发布信息。"}
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
        ) : isNewVersion && sourceSkill && user && !isSkillContributor(sourceSkill, user) ? (
          <section className="auth-card card">
            <span className="eyebrow">
              <KeyRound size={14} />
              Contributor required
            </span>
            <h1>无权发布新版本</h1>
            <p className="description">只有该 Skill 的 contributor 可以从此页面发布新版本。</p>
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
                <div
                  className={`upload-dropzone ${file ? "selected" : ""} ${isDraggingFile ? "dragging" : ""} ${parsingArchive ? "dragging" : ""}`}
                  onDragEnter={handleFileDragEnter}
                  onDragLeave={handleFileDragLeave}
                  onDragOver={handleFileDragOver}
                  onDrop={handleFileDrop}
                >
                  <UploadCloud size={28} />
                  <strong>{fileLabel}</strong>
                  <span>
                    拖拽 Skill 文件夹或 .zip 到此处；须包含 {SKILL_ENTRY_BASENAMES.join("、")}（可在根目录或单一顶层目录下）。
                    {file ? " 重新选择将覆盖当前包并重新解析。" : ""}
                  </span>
                  <div className="upload-dropzone-actions">
                    <button
                      className="button secondary compact"
                      disabled={parsingArchive}
                      onClick={() => folderInputRef.current?.click()}
                      type="button"
                    >
                      选择文件夹
                    </button>
                    <button
                      className="button secondary compact"
                      disabled={parsingArchive}
                      onClick={() => fileInputRef.current?.click()}
                      type="button"
                    >
                      选择 .zip
                    </button>
                  </div>
                  <input
                    accept=".zip,application/zip"
                    hidden
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    type="file"
                  />
                  <input
                    hidden
                    multiple
                    onChange={handleFolderChange}
                    ref={folderInputRef}
                    type="file"
                    webkitdirectory=""
                  />
                </div>

                {!showPublishForm && error ? <div className="error compact-error">{error}</div> : null}

                {showPublishForm ? (
                  <div className="publish-form-fields">
                    {archiveHint ? <div className="notice">{archiveHint}</div> : null}

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
                        <small>展示名称，用于列表与详情页标题。</small>
                      </label>

                      <div className="publish-field-with-hint">
                        <label className="field">
                          <span>Slug <em>必填</em></span>
                          <input
                            maxLength={64}
                            onChange={(event) => {
                              setError(null);
                              setSlug(event.target.value);
                            }}
                            pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                            placeholder="例如 github-issue-triage"
                            readOnly={isNewVersion}
                            required
                            value={slug}
                          />
                        </label>
                        <small>
                          唯一标识 ID。
                          {isNewVersion
                            ? "新版本沿用原 Skill 的不可变 Slug。"
                            : "仅小写字母、数字和短横线；发布后不可修改。"}
                          {slugStatusMessage ? (
                            <>
                              {" "}
                              <span className={slugPermissionError ? "publish-slug-status error-text" : "publish-slug-status"}>
                                {slugStatusMessage}
                              </span>
                            </>
                          ) : null}
                        </small>
                      </div>
                    </div>

                    <label className="field">
                      <span>Summary <em>必填</em></span>
                      <textarea
                        maxLength={1024}
                        onChange={(event) => setSummary(event.target.value)}
                        placeholder="说明 Skill 能做什么、适用于什么场景"
                        required
                        rows={4}
                        value={summary}
                      />
                      <small>Skill 摘要，说明能做什么及适用场景。</small>
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
                        <small>
                          Skill 功能类别，可用以搜索的标签。最多可选择 {MAX_CATEGORIES} 个。
                        </small>
                      </div>

                      <label className="field">
                        <span>Topics <i>选填</i></span>
                        <input
                          maxLength={1024}
                          onChange={(event) => setTopics(event.target.value)}
                          placeholder="例如 github, issues, automation"
                          value={topics}
                        />
                        <small>Skill 业务内容、用户自定义标签。使用逗号分隔，每项最多 64 个字符。</small>
                      </label>
                    </div>

                    <div className="publish-form-grid">
                      <label className="field">
                        <span>Version <em>必填</em></span>
                        <input
                          onChange={(event) => {
                            setError(null);
                            setVersion(event.target.value);
                          }}
                          pattern="(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?"
                          placeholder="1.0.0"
                          required
                          value={version}
                        />
                        <small>
                          {isNewVersion && sourceSkill
                            ? `须高于当前最新版本 v${sourceSkill.latestVersion}（SemVer），例如 ${suggestNextPatchVersion(sourceSkill.latestVersion)}。`
                            : "采用 SemVer 格式，例如 1.0.0。"}
                        </small>
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

                    <button className="button primary" disabled={submitting || !canPublish} type="submit">
                      {submitting ? "发布并审查中..." : isNewVersion ? "发布新版本" : "发布 Skill"}
                      <ArrowRight size={16} />
                    </button>

                    {error || (!canPublish && publishBlockReason) ? (
                      <div className="error compact-error publish-form-feedback">{error ?? publishBlockReason}</div>
                    ) : null}
                  </div>
                ) : null}
              </form>
            </div>
          </section>
        )}

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
  const sharedError = validatePublishMetadataInput(metadata);
  if (sharedError) {
    return sharedError;
  }
  if (metadata.categories.length > MAX_CATEGORIES) {
    return `Category 最多选择 ${MAX_CATEGORIES} 个。`;
  }
  return undefined;
}

function getVersionConflictMessage(skill: RegistrySkill | null | undefined, versionInput: string): string | null {
  const nextVersion = versionInput.trim();
  if (!skill || !nextVersion) {
    return null;
  }
  if (skill.versions[nextVersion]) {
    return `版本号冲突：v${nextVersion} 已存在，请改用尚未发布的版本号（当前最新为 v${skill.latestVersion}）。`;
  }
  const compared = compareSemver(nextVersion, skill.latestVersion);
  if (compared !== null && compared <= 0) {
    return `新版本号必须高于当前最新版本 v${skill.latestVersion}（SemVer），不能使用 v${nextVersion}。`;
  }
  return null;
}

function formatPublishError(message: string): string {
  const duplicateMatch = /^Version already exists: ([^@]+)@(.+)$/.exec(message);
  if (duplicateMatch) {
    const [, conflictSlug, conflictVersion] = duplicateMatch;
    return `版本号冲突：v${conflictVersion} 已存在于 Skill「${conflictSlug}」，请改用尚未发布的版本号。`;
  }
  const bumpMatch = /^Version must be greater than latest: ([^@]+)@([^,]+), got (.+)$/.exec(message);
  if (bumpMatch) {
    const [, , latestVersion, attemptedVersion] = bumpMatch;
    return `新版本号必须高于当前最新版本 v${latestVersion}（SemVer），不能使用 v${attemptedVersion}。`;
  }
  if (/Only skill contributors can publish new versions/i.test(message)) {
    return "你没有权限向该 Skill 发布新版本。";
  }
  return message;
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

async function loadFrontmatterFromArchive(file: File): Promise<PublishSkillFrontmatter | null> {
  const token = getAuthToken();
  if (token) {
    try {
      const archiveBase64 = await readFileAsBase64(file);
      const preview = await previewSkillArchive(token, archiveBase64);
      return preview.frontmatter;
    } catch {
      // Fall back to browser parsing when API is unavailable.
    }
  }

  const local = await readSkillFrontmatterFromZip(file);
  return local;
}

interface FrontmatterSetters {
  setDisplayName: (value: string) => void;
  setSlug: (value: string) => void;
  setSummary: (value: string) => void;
  setVersion: (value: string) => void;
  setCategories: (value: string[]) => void;
  setTopics: (value: string) => void;
}

function applyFrontmatterToForm(
  frontmatter: PublishSkillFrontmatter | null,
  isNewVersion: boolean,
  setters: FrontmatterSetters
): string[] {
  if (!frontmatter) {
    return [];
  }

  const filledFields: string[] = [];

  if (!isNewVersion) {
    if (frontmatter.name) {
      setters.setDisplayName(frontmatter.name);
      filledFields.push("Display Name");
    }
    if (frontmatter.slug) {
      setters.setSlug(frontmatter.slug);
      filledFields.push("Slug");
    }
  }

  if (frontmatter.description) {
    setters.setSummary(frontmatter.description);
    filledFields.push("Summary");
  }
  if (frontmatter.version) {
    setters.setVersion(frontmatter.version);
    filledFields.push("Version");
  }
  if (frontmatter.categories?.length) {
    setters.setCategories(frontmatter.categories.slice(0, MAX_CATEGORIES));
    filledFields.push("Categories");
  }
  if (frontmatter.topics?.length) {
    setters.setTopics(frontmatter.topics.join(", "));
    filledFields.push("Topics");
  }

  return filledFields;
}
