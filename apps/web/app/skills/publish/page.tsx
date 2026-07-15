"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, KeyRound, UploadCloud } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { ScoreBars } from "../../../components/ScoreBars";
import { EvaluationBadge, VerdictBadge } from "../../../components/StatusBadge";
import { getCurrentUser, publishSkillArchive, type PublishSkillResponse } from "../../../lib/api";
import { getAuthToken } from "../../../lib/auth-token";
import type { PublicUser } from "../../../lib/types";

export default function PublishSkillPage() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState("");
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

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setResult(null);
    setError(null);
    setFile(event.target.files?.[0] ?? null);
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

    setSubmitting(true);
    try {
      const archiveBase64 = await readFileAsBase64(file);
      const published = await publishSkillArchive(token, archiveBase64, version);
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
                <label className={`upload-dropzone ${file ? "selected" : ""}`}>
                  <UploadCloud size={28} />
                  <strong>{fileLabel}</strong>
                  <span>包含根目录 `SKILL.md` 的 zip 包，或一个单顶层目录内包含 `SKILL.md`。</span>
                  <input accept=".zip,application/zip" onChange={handleFileChange} type="file" />
                </label>

                <label className="field">
                  <span>版本号（可选）</span>
                  <input
                    onChange={(event) => setVersion(event.target.value)}
                    placeholder="例如 1.0.0；留空时使用 SKILL.md 中的 version"
                    value={version}
                  />
                </label>

                {error ? <div className="error compact-error">{error}</div> : null}

                <button className="button primary" disabled={submitting} type="submit">
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
                <h2 style={{ marginTop: 14 }}>{result.skill}@{result.version}</h2>
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
                  <Link className="button secondary" href={`/skills/${encodeURIComponent(result.skill)}`}>
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
