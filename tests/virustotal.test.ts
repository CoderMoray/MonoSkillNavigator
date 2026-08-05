import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
  reviewSkillSnapshot,
  runVirusTotalScan
} from "@skill-platform/review-engine";
import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import { readSkillPackage, type SkillSnapshot } from "@skill-platform/skill-spec";

const configuredVariables = [
  "SKILLSPECTOR_ENABLED",
  "VIRUSTOTAL_ENABLED",
  "VIRUSTOTAL_API_KEY",
  "VIRUSTOTAL_UPLOAD_ON_MISS",
  "VIRUSTOTAL_TIMEOUT_MS",
  "VIRUSTOTAL_POLL_INTERVAL_MS"
] as const;
const originalEnvironment = new Map(
  configuredVariables.map((name) => [name, process.env[name]])
);

let snapshot: SkillSnapshot;

function evaluation(): FunctionalEvaluationReport {
  return {
    id: "evaluation-80",
    provider: "static-taskset",
    status: "passed",
    score: 80,
    tasksTotal: 1,
    tasksPassed: 1,
    taskResults: [],
    findings: [],
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function configureVirusTotal(): void {
  process.env.SKILLSPECTOR_ENABLED = "false";
  process.env.VIRUSTOTAL_ENABLED = "true";
  process.env.VIRUSTOTAL_API_KEY = "test-api-key";
  process.env.VIRUSTOTAL_UPLOAD_ON_MISS = "false";
  process.env.VIRUSTOTAL_TIMEOUT_MS = "1000";
  process.env.VIRUSTOTAL_POLL_INTERVAL_MS = "1";
}

beforeAll(async () => {
  snapshot = await readSkillPackage(resolve("examples/demo-skill"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of originalEnvironment) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("VirusTotal package review adapter", () => {
  test("adds a malicious finding from an existing VirusTotal report", async () => {
    configureVirusTotal();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          attributes: {
            last_analysis_stats: {
              malicious: 2,
              suspicious: 1,
              harmless: 5,
              undetected: 61
            }
          }
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const report = await reviewSkillSnapshot(snapshot, undefined, evaluation());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/files\/[a-f0-9]{64}$/);
    expect(report.virusTotal).toMatchObject({
      provider: "virustotal",
      status: "completed",
      malicious: 2,
      suspicious: 1
    });
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^virustotal-malicious-/),
        severity: "high"
      })
    );
  });

  test("does not upload an unknown archive unless explicitly enabled", async () => {
    configureVirusTotal();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    vi.stubGlobal("fetch", fetchMock);

    const scan = await runVirusTotalScan(snapshot);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(scan.summary).toMatchObject({
      provider: "virustotal",
      status: "not_found",
      malicious: 0,
      suspicious: 0
    });
    expect(scan.findings).toEqual([]);
  });

  test("uploads an unknown archive and waits for its analysis when enabled", async () => {
    configureVirusTotal();
    process.env.VIRUSTOTAL_UPLOAD_ON_MISS = "true";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({ data: { id: "analysis-id" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            attributes: {
              status: "completed",
              stats: {
                malicious: 0,
                suspicious: 1,
                harmless: 4,
                undetected: 60
              }
            }
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const scan = await runVirusTotalScan(snapshot);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    expect(scan.summary).toMatchObject({
      status: "completed",
      malicious: 0,
      suspicious: 1
    });
    expect(scan.findings).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^virustotal-suspicious-/),
        severity: "medium"
      })
    );
  });
});
