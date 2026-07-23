"use client";

import { useState } from "react";
import { MarkdownContent } from "./MarkdownContent";
import type { HaluCatchReportBundle } from "../lib/types";

export type HaluCatchReportTab = "professional" | "simple" | "action";

const reportTabs: Array<{ id: HaluCatchReportTab; label: string }> = [
  { id: "professional", label: "专业版" },
  { id: "simple", label: "标准版" },
  { id: "action", label: "行动版" }
];

export function HaluCatchReportViewer({ report }: { report: HaluCatchReportBundle }) {
  const [activeTab, setActiveTab] = useState<HaluCatchReportTab>("professional");
  const markdown =
    activeTab === "simple" ? report.simple : activeTab === "action" ? report.action : report.professional;

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
      <MarkdownContent className="markdown-content halucatch-report-content">{markdown}</MarkdownContent>
    </>
  );
}
