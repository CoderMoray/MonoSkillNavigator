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
}

interface VirusTotalStats {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
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
  const existingStats = await lookupFileStats(sha256, apiKey);
  if (existingStats) {
    return completeScan(sha256, existingStats);
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
  const stats = await waitForAnalysis(analysisId, apiKey);
  return completeScan(sha256, stats);
}

function completeScan(
  sha256: string,
  stats: VirusTotalStats
): { summary: VirusTotalScanSummary; findings: ReviewFinding[] } {
  const summary: VirusTotalScanSummary = {
    provider: "virustotal",
    sha256,
    status: "completed",
    ...stats,
    analysisUrl: `${VIRUSTOTAL_GUI_BASE_URL}/${sha256}`
  };

  return { summary, findings: createFindings(summary) };
}

async function lookupFileStats(sha256: string, apiKey: string): Promise<VirusTotalStats | undefined> {
  const response = await virusTotalFetch(`${VIRUSTOTAL_API_BASE_URL}/files/${sha256}`, apiKey);
  if (response.status === 404) {
    return undefined;
  }

  const payload = await readJsonResponse(response, "VirusTotal file lookup");
  const stats = getNestedValue(payload, ["data", "attributes", "last_analysis_stats"]);
  return parseStats(stats, "VirusTotal file lookup");
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

async function waitForAnalysis(analysisId: string, apiKey: string): Promise<VirusTotalStats> {
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
      const stats = getNestedValue(payload, ["data", "attributes", "stats"]);
      return parseStats(stats, "VirusTotal analysis");
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

function createFindings(summary: VirusTotalScanSummary): ReviewFinding[] {
  if (summary.status !== "completed") {
    return [];
  }

  const engines = summary.malicious + summary.suspicious + summary.harmless + summary.undetected;
  const evidence = [
    `SHA-256: ${summary.sha256}`,
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
