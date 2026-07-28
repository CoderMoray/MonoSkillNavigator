import { saveBlobAsFile } from "./api";

export function buildHaluCatchReportPath(skillSlug: string, version: string): string {
  const params = new URLSearchParams({ version });
  return `/skills/${encodeURIComponent(skillSlug)}/halucatch?${params.toString()}`;
}

export function extractHaluCatchSummary(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const tldrMatch = normalized.match(
    /###\s*(?:一句话总结|TL;DR|TLDR)[^\n]*\n+([\s\S]*?)(?:\n##|\n###|$)/i
  );
  if (tldrMatch?.[1]?.trim()) {
    return tldrMatch[1].trim();
  }

  const lines = normalized.split("\n").filter((line) => line.trim());
  return lines.slice(0, 6).join("\n").trim();
}

export function buildHaluCatchActionReportFileName(skillSlug: string, version: string): string {
  const safeSlug = skillSlug.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "skill";
  const safeVersion = version.replace(/[^a-z0-9._-]+/gi, "-") || "0.0.0";
  return `${safeSlug}-v${safeVersion}-halucatch-action.md`;
}

export function downloadHaluCatchActionReport(markdown: string, fileName: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  saveBlobAsFile(blob, fileName);
}
