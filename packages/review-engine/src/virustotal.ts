import { createHash } from "node:crypto";
import { skillSnapshotToZipBuffer, type SkillSnapshot } from "@skill-platform/skill-spec";
import type { ReviewFinding } from "./index.js";

const VIRUSTOTAL_API_BASE_URL = "https://www.virustotal.com/api/v3";
const VIRUSTOTAL_GUI_BASE_URL = "https://www.virustotal.com/gui/file";
const DIRECT_UPLOAD_LIMIT_BYTES = 32 * 1024 * 1024;
const MAX_UPLOAD_LIMIT_BYTES = 650 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_POLL_INTERVAL_MS = 30_000;

export type VirusTotalScanStatus = "completed" | "not_found" | "failed";

export type VirusTotalThreatVerdict =
  | "VERDICT_UNKNOWN"
  | "VERDICT_UNDETECTED"
  | "VERDICT_SUSPICIOUS"
  | "VERDICT_MALICIOUS";

const VIRUSTOTAL_THREAT_VERDICTS = new Set<VirusTotalThreatVerdict>([
  "VERDICT_UNKNOWN",
  "VERDICT_UNDETECTED",
  "VERDICT_SUSPICIOUS",
  "VERDICT_MALICIOUS"
]);

export interface VirusTotalEngineResult {
  engine: string;
  category: string;
  result: string;
  method?: string;
  engineUpdate?: string;
}

export interface VirusTotalScanSummary {
  provider: "virustotal";
  sha256: string;
  status: VirusTotalScanStatus;
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  analysisUrl?: string;
  error?: string;
  threatVerdict?: VirusTotalThreatVerdict;
  engineResults?: VirusTotalEngineResult[];
}

interface VirusTotalStats {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
}

interface VirusTotalReport {
  stats: VirusTotalStats;
  engineResults: VirusTotalEngineResult[];
  threatVerdict?: VirusTotalThreatVerdict;
}

export function isVirusTotalEnabled(): boolean {
  return Boolean(readApiKey()) && process.env.VIRUSTOTAL_ENABLED?.trim().toLowerCase() !== "false";
}

export function isVirusTotalUploadOnMissEnabled(): boolean {
  return process.env.VIRUSTOTAL_UPLOAD_ON_MISS?.trim().toLowerCase() === "true";
}

export async function runVirusTotalScan(
  snapshot: SkillSnapshot
): Promise<{ summary: VirusTotalScanSummary; findings: ReviewFinding[] }> {
  const apiKey = readApiKey();
  if (!apiKey) {
    throw new Error("VIRUSTOTAL_API_KEY is required to run VirusTotal scans.");
  }

  const archive = skillSnapshotToZipBuffer(snapshot);
  if (archive.byteLength > MAX_UPLOAD_LIMIT_BYTES) {
    throw new Error(
      `Skill archive is ${archive.byteLength} bytes, exceeding VirusTotal's ${MAX_UPLOAD_LIMIT_BYTES}-byte upload limit.`
    );
  }

  const sha256 = createHash("sha256").update(archive).digest("hex");
  const existingReport = await lookupFileReport(sha256, apiKey);
  if (existingReport) {
    return completeScan(sha256, existingReport);
  }

  if (!isVirusTotalUploadOnMissEnabled()) {
    return {
      summary: {
        provider: "virustotal",
        sha256,
        status: "not_found",
        malicious: 0,
        suspicious: 0,
        harmless: 0,
        undetected: 0
      },
      findings: []
    };
  }

  const analysisId = await uploadArchive(archive, apiKey);
  await waitForAnalysis(analysisId, apiKey);
  const report = await lookupFileReport(sha256, apiKey);
  if (!report) {
    throw new Error("VirusTotal file report unavailable after upload analysis.");
  }
  return completeScan(sha256, report);
}

function completeScan(
  sha256: string,
  report: VirusTotalReport
): { summary: VirusTotalScanSummary; findings: ReviewFinding[] } {
  const summary: VirusTotalScanSummary = {
    provider: "virustotal",
    sha256,
    status: "completed",
    ...report.stats,
    analysisUrl: `${VIRUSTOTAL_GUI_BASE_URL}/${sha256}`,
    engineResults: report.engineResults,
    ...(report.threatVerdict ? { threatVerdict: report.threatVerdict } : {})
  };

  return { summary, findings: createFindings(summary, report.engineResults) };
}

async function lookupFileReport(sha256: string, apiKey: string): Promise<VirusTotalReport | undefined> {
  const response = await virusTotalFetch(`${VIRUSTOTAL_API_BASE_URL}/files/${sha256}`, apiKey);
  if (response.status === 404) {
    return undefined;
  }

  const payload = await readJsonResponse(response, "VirusTotal file lookup");
  return parseFileReportPayload(payload, "VirusTotal file lookup");
}

function parseFileReportPayload(payload: unknown, source: string): VirusTotalReport {
  const stats = getNestedValue(payload, ["data", "attributes", "last_analysis_stats"]);
  const engineResults = getNestedValue(payload, ["data", "attributes", "last_analysis_results"]);
  const threatVerdict = parseThreatVerdict(getNestedValue(payload, ["data", "attributes", "threat_verdict"]));
  return {
    stats: parseStats(stats, source),
    engineResults: parseEngineResults(engineResults),
    ...(threatVerdict ? { threatVerdict } : {})
  };
}

export function parseThreatVerdict(value: unknown): VirusTotalThreatVerdict | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase() as VirusTotalThreatVerdict;
  return VIRUSTOTAL_THREAT_VERDICTS.has(normalized) ? normalized : undefined;
}

async function uploadArchive(archive: Buffer, apiKey: string): Promise<string> {
  const uploadUrl =
    archive.byteLength > DIRECT_UPLOAD_LIMIT_BYTES
      ? await getLargeFileUploadUrl(apiKey)
      : `${VIRUSTOTAL_API_BASE_URL}/files`;
  const form = new FormData();
  form.set("file", new Blob([Uint8Array.from(archive)], { type: "application/zip" }), "skill.zip");

  const payload = await readJsonResponse(
    await virusTotalFetch(uploadUrl, apiKey, { method: "POST", body: form }),
    "VirusTotal file upload"
  );
  const analysisId = getNestedValue(payload, ["data", "id"]);
  if (typeof analysisId !== "string" || !analysisId.trim()) {
    throw new Error("VirusTotal file upload returned no analysis ID.");
  }
  return analysisId;
}

async function getLargeFileUploadUrl(apiKey: string): Promise<string> {
  const payload = await readJsonResponse(
    await virusTotalFetch(`${VIRUSTOTAL_API_BASE_URL}/files/upload_url`, apiKey),
    "VirusTotal upload URL request"
  );
  const uploadUrl = getNestedValue(payload, ["data"]);
  if (typeof uploadUrl !== "string" || !uploadUrl.startsWith("https://")) {
    throw new Error("VirusTotal upload URL response was invalid.");
  }
  return uploadUrl;
}

async function waitForAnalysis(analysisId: string, apiKey: string): Promise<void> {
  const timeoutMs = readPositiveInteger(process.env.VIRUSTOTAL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const pollIntervalMs = readPositiveInteger(
    process.env.VIRUSTOTAL_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS
  );
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
    const payload = await readJsonResponse(
      await virusTotalFetch(`${VIRUSTOTAL_API_BASE_URL}/analyses/${encodeURIComponent(analysisId)}`, apiKey),
      "VirusTotal analysis lookup"
    );
    const status = getNestedValue(payload, ["data", "attributes", "status"]);

    if (status === "completed") {
      return;
    }

    if (status === "failed") {
      throw new Error("VirusTotal analysis failed.");
    }
  }

  throw new Error(`VirusTotal analysis timed out after ${timeoutMs}ms.`);
}

async function virusTotalFetch(url: string, apiKey: string, init?: RequestInit): Promise<Response> {
  const timeoutMs = readPositiveInteger(process.env.VIRUSTOTAL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      headers: { "x-apikey": apiKey },
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`VirusTotal request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonResponse(response: Response, action: string): Promise<unknown> {
  const payload = await response.json().catch(() => undefined);
  if (response.ok) {
    return payload;
  }

  const message = getNestedValue(payload, ["error", "message"]);
  const suffix = typeof message === "string" && message.trim() ? `: ${message.trim()}` : "";
  throw new Error(`${action} failed with HTTP ${response.status}${suffix}`);
}

function parseStats(value: unknown, source: string): VirusTotalStats {
  if (!isRecord(value)) {
    throw new Error(`${source} returned no analysis statistics.`);
  }

  return {
    malicious: readCount(value.malicious),
    suspicious: readCount(value.suspicious),
    harmless: readCount(value.harmless),
    undetected: readCount(value.undetected)
  };
}

export function parseEngineResults(value: unknown): VirusTotalEngineResult[] {
  if (!isRecord(value)) {
    return [];
  }

  const results: VirusTotalEngineResult[] = [];
  for (const [engine, entry] of Object.entries(value)) {
    if (!isRecord(entry)) {
      continue;
    }

    const category = typeof entry.category === "string" ? entry.category.trim().toLowerCase() : "undetected";
    if (category !== "malicious" && category !== "suspicious") {
      continue;
    }

    const result = typeof entry.result === "string" ? entry.result.trim() : "";
    results.push({
      engine,
      category,
      result: result || category,
      method: typeof entry.method === "string" ? entry.method : undefined,
      engineUpdate: typeof entry.engine_update === "string" ? entry.engine_update : undefined
    });
  }

  return results.sort((left, right) => {
    const categoryRank = (category: string) => (category === "malicious" ? 0 : 1);
    const rankDiff = categoryRank(left.category) - categoryRank(right.category);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return left.engine.localeCompare(right.engine);
  });
}

function createFindings(summary: VirusTotalScanSummary, engineResults: VirusTotalEngineResult[]): ReviewFinding[] {
  if (summary.status !== "completed") {
    return [];
  }

  const flagged = engineResults.filter(
    (engine) => engine.category === "malicious" || engine.category === "suspicious"
  );
  if (flagged.length > 0) {
    return flagged.map((engine) => createEngineFinding(summary, engine));
  }

  return createAggregateFindings(summary);
}

function createEngineFinding(summary: VirusTotalScanSummary, engine: VirusTotalEngineResult): ReviewFinding {
  const severity = engine.category === "malicious" ? "high" : "medium";
  const engineKey = slugifyEngineName(engine.engine);

  return {
    id: `virustotal-${engine.category}-${summary.sha256.slice(0, 16)}-${engineKey}`,
    category: "security",
    severity,
    title: `VirusTotal (${engine.engine}): ${engine.result}`,
    message: `${engine.engine} classified this package as ${engine.category}.`,
    evidence: buildEngineEvidence(summary, engine),
    recommendation:
      engine.category === "malicious"
        ? "Do not publish this package until the flagged content is removed or the VirusTotal detection is reviewed and cleared."
        : "Review the package and VirusTotal report before publishing; remove suspicious behavior or document a verified false positive."
  };
}

function createAggregateFindings(summary: VirusTotalScanSummary): ReviewFinding[] {
  const engines = summary.malicious + summary.suspicious + summary.harmless + summary.undetected;
  const evidence = [
    `SHA-256: ${summary.sha256}`,
    ...(summary.threatVerdict ? [`Threat verdict: ${summary.threatVerdict}`] : []),
    `VirusTotal engines: malicious=${summary.malicious}, suspicious=${summary.suspicious}, harmless=${summary.harmless}, undetected=${summary.undetected}`,
    ...(summary.analysisUrl ? [`Report: ${summary.analysisUrl}`] : [])
  ].join("\n");

  if (summary.malicious > 0) {
    return [
      {
        id: `virustotal-malicious-${summary.sha256.slice(0, 16)}`,
        category: "security",
        severity: "high",
        title: "VirusTotal detected malicious content",
        message: `VirusTotal reported ${summary.malicious} malicious detection(s)${summary.suspicious ? ` and ${summary.suspicious} suspicious detection(s)` : ""}${engines ? ` across ${engines} engines` : ""}.`,
        evidence,
        recommendation:
          "Do not publish this package until the flagged content is removed or the VirusTotal detections are reviewed and cleared."
      }
    ];
  }

  if (summary.suspicious > 0) {
    return [
      {
        id: `virustotal-suspicious-${summary.sha256.slice(0, 16)}`,
        category: "security",
        severity: "medium",
        title: "VirusTotal detected suspicious content",
        message: `VirusTotal reported ${summary.suspicious} suspicious detection(s)${engines ? ` across ${engines} engines` : ""}.`,
        evidence,
        recommendation:
          "Review the package and VirusTotal report before publishing; remove suspicious behavior or document a verified false positive."
      }
    ];
  }

  return [];
}

function buildEngineEvidence(summary: VirusTotalScanSummary, engine: VirusTotalEngineResult): string {
  return [
    `SHA-256: ${summary.sha256}`,
    ...(summary.threatVerdict ? [`Threat verdict: ${summary.threatVerdict}`] : []),
    `Engine: ${engine.engine}`,
    `Category: ${engine.category}`,
    `Result: ${engine.result}`,
    ...(engine.method ? [`Method: ${engine.method}`] : []),
    ...(engine.engineUpdate ? [`Engine update: ${engine.engineUpdate}`] : []),
    ...(summary.analysisUrl ? [`Report: ${summary.analysisUrl}`] : [])
  ].join("\n");
}

function slugifyEngineName(engine: string): string {
  const slug = engine
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "engine";
}

function getNestedValue(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function readApiKey(): string | undefined {
  const value = process.env.VIRUSTOTAL_API_KEY?.trim();
  return value || undefined;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
