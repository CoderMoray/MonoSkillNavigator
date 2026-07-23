"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "../../../../components/AppShell";
import { HaluCatchReportViewer } from "../../../../components/HaluCatchReportViewer";
import { EvaluationBadge } from "../../../../components/StatusBadge";
import { getSkill } from "../../../../lib/api";
import { getAuthToken } from "../../../../lib/auth-token";
import { formatDateTime } from "../../../../lib/format";
import type { RegistrySkill, RegistryVersion } from "../../../../lib/types";

export default function HaluCatchReportPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="HaluCatch 报告">
          <div className="skeleton" />
        </AppShell>
      }
    >
      <HaluCatchReportPageContent />
    </Suspense>
  );
}

function HaluCatchReportPageContent() {
  const params = useParams<{ name: string }>();
  const searchParams = useSearchParams();
  const skillSlug = decodeURIComponent(params.name);
  const requestedVersion = searchParams.get("version");
  const [skill, setSkill] = useState<RegistrySkill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = getAuthToken();
        const data = await getSkill(skillSlug, token ?? undefined);
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
  }, [skillSlug]);

  const version: RegistryVersion | undefined = useMemo(() => {
    if (!skill) {
      return undefined;
    }
    if (requestedVersion && skill.versions[requestedVersion]) {
      return skill.versions[requestedVersion];
    }
    return skill.versions[skill.latestVersion];
  }, [requestedVersion, skill]);

  const haluCatchReport = version?.evaluation?.haluCatchReport;
  const backHref = `/skills/${encodeURIComponent(skillSlug)}`;

  if (loading) {
    return (
      <AppShell title="HaluCatch 报告">
        <div className="loading-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="skeleton" key={index} />
          ))}
        </div>
      </AppShell>
    );
  }

  if (error || !skill || !version) {
    return (
      <AppShell title="HaluCatch 报告">
        <div className="error">{error ?? "Skill 不存在"}</div>
        <Link className="button secondary" href={backHref} style={{ marginTop: 16 }}>
          <ArrowLeft size={16} /> 返回 Skill 详情
        </Link>
      </AppShell>
    );
  }

  if (!haluCatchReport) {
    return (
      <AppShell title="HaluCatch 报告">
        <div className="card detail-panel">
          <div className="empty detail-empty">该版本暂无 HaluCatch 完整报告。</div>
          <Link className="button secondary" href={backHref} style={{ marginTop: 16 }}>
            <ArrowLeft size={16} /> 返回 Skill 详情
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={`HaluCatch · ${skill.name}`}>
      <section className="section-head">
        <div>
          <Link className="text-link halucatch-report-back-link" href={backHref}>
            <ArrowLeft size={14} /> 返回 Skill 详情
          </Link>
          <h1>HaluCatch 完整报告</h1>
          <p className="description">
            {skill.name} · v{version.version} · Skill 类型 {haluCatchReport.skillType}
          </p>
        </div>
        {version.evaluation ? <EvaluationBadge status={version.evaluation.status} /> : null}
      </section>

      <section className="card detail-panel">
        <div className="evaluation-summary">
          <div>
            <span>可靠性分</span>
            <strong>{version.evaluation?.score ?? "—"}</strong>
          </div>
          <div>
            <span>Tasks</span>
            <strong>
              {version.evaluation?.tasksPassed ?? 0}/{version.evaluation?.tasksTotal ?? 0}
            </strong>
          </div>
          <div>
            <span>评估时间</span>
            <strong>{version.evaluation ? formatDateTime(version.evaluation.createdAt) : "—"}</strong>
          </div>
        </div>

        <div className="detail-subsection">
          <div className="section-head">
            <div>
              <h2>报告正文</h2>
              <p className="description">包含 HaluCatch 生成的专业版、标准版与 AI 行动版 Markdown 报告。</p>
            </div>
          </div>
          <HaluCatchReportViewer report={haluCatchReport} />
        </div>
      </section>
    </AppShell>
  );
}
