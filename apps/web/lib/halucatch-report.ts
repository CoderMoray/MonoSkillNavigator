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
