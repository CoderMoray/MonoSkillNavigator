"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";
import type { HaluCatchReportBundle } from "../lib/types";
import { downloadHaluCatchActionReport } from "../lib/halucatch-report";

export type HaluCatchReportTab = "professional" | "simple" | "action";

const reportTabs: Array<{ id: HaluCatchReportTab; label: string }> = [
  { id: "professional", label: "专业版" },
  { id: "simple", label: "标准版" },
  { id: "action", label: "行动版" }
];

export function HaluCatchReportViewer({
  report,
  actionDownloadFileName
}: {
  report: HaluCatchReportBundle;
  actionDownloadFileName?: string;
}) {
  const [activeTab, setActiveTab] = useState<HaluCatchReportTab>("professional");
  const markdown =
    activeTab === "simple" ? report.simple : activeTab === "action" ? report.action : report.professional;
  const canDownloadAction = Boolean(report.action.trim() && actionDownloadFileName);

  function handleDownloadActionReport() {
    if (!actionDownloadFileName || !report.action.trim()) {
      return;
    }
    downloadHaluCatchActionReport(report.action, actionDownloadFileName);
  }

  return (
    <>
      <div className="detail-tab-bar halucatch-report-tabs" role="tablist" aria-label="HaluCatch 报告版本">
        {reportTabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={`detail-tab ${activeTab === tab.id ? "active" : ""}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "action" ? (
        <div className="halucatch-action-download-panel">
          <p className="description">
            行动版报告面向 AI 助手，汇总可执行的修复步骤。下载 Markdown 后，可在 Cursor、Copilot 等工具中 @
            本地 Skill 目录，让 AI 按报告逐项改包。
          </p>
          <button
            className="button secondary compact"
            disabled={!canDownloadAction}
            onClick={handleDownloadActionReport}
            type="button"
          >
            <Download size={14} /> 下载行动版报告
          </button>
        </div>
      ) : null}
      <MarkdownContent className="markdown-content halucatch-report-content">{markdown}</MarkdownContent>
    </>
  );
}
