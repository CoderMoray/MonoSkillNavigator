import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
  parseEngineResults,
  parseThreatVerdict,
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

describe("VirusTotal engine result parsing", () => {
  test("extracts malicious and suspicious engine detections only", () => {
    const results = parseEngineResults({
      Kaspersky: {
        category: "malicious",
        result: "Trojan.Generic",
        method: "blacklist",
        engine_update: "20260101"
      },
      Avast: {
        category: "harmless",
        result: "Clean"
      },
      Elastic: {
        category: "suspicious",
        result: "Suspicious archive"
      }
    });

    expect(results).toEqual([
      expect.objectContaining({
        engine: "Kaspersky",
        category: "malicious",
        result: "Trojan.Generic"
      }),
      expect.objectContaining({
        engine: "Elastic",
        category: "suspicious",
        result: "Suspicious archive"
      })
    ]);
  });

  test("parses supported threat verdict values", () => {
    expect(parseThreatVerdict("VERDICT_MALICIOUS")).toBe("VERDICT_MALICIOUS");
    expect(parseThreatVerdict("verdict_suspicious")).toBe("VERDICT_SUSPICIOUS");
    expect(parseThreatVerdict("unsupported")).toBeUndefined();
  });
});

describe("VirusTotal package review adapter", () => {
  test("adds grouped findings by category from an existing VirusTotal report", async () => {
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
            },
            last_analysis_results: {
              Kaspersky: {
                category: "malicious",
                result: "Trojan.Generic",
                method: "blacklist"
              },
              "Microsoft Defender": {
                category: "malicious",
                result: "Trojan:Script/Wacatac",
                method: "blacklist"
              },
              Elastic: {
                category: "suspicious",
                result: "Suspicious archive"
              },
              Avast: {
                category: "harmless",
                result: "Clean"
              }
            },
            threat_verdict: "VERDICT_MALICIOUS"
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
      suspicious: 1,
      threatVerdict: "VERDICT_MALICIOUS"
    });
    expect(report.virusTotal?.engineResults).toHaveLength(3);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^virustotal-malicious-[a-f0-9]{16}$/),
        severity: "high",
        title: "VirusTotal (malicious)",
        message: "Kaspersky, Microsoft Defender classified this package as malicious.",
        evidence: expect.stringMatching(/Result:\n\tKaspersky: Trojan\.Generic\n\tMicrosoft Defender: Trojan:Script\/Wacatac/),
        recommendation:
          "Do not publish this package until the flagged content is removed or the VirusTotal detection is reviewed and cleared."
      })
    );
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^virustotal-suspicious-[a-f0-9]{16}$/),
        severity: "medium",
        title: "VirusTotal (suspicious)",
        message: "Elastic classified this package as suspicious."
      })
    );
    const virusTotalFindings = report.findings.filter((finding) => finding.id.startsWith("virustotal-"));
    expect(virusTotalFindings).toHaveLength(2);
    for (const finding of virusTotalFindings) {
      expect(finding.evidence).not.toMatch(/^Engine:/m);
    }
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
              status: "completed"
            }
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            attributes: {
              last_analysis_stats: {
                malicious: 0,
                suspicious: 1,
                harmless: 4,
                undetected: 60
              },
              last_analysis_results: {
                "Cynet Security": {
                  category: "suspicious",
                  result: "Suspicious.Zip",
                  method: "blacklist"
                }
              },
              threat_verdict: "VERDICT_SUSPICIOUS"
            }
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const scan = await runVirusTotalScan(snapshot);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    expect(String(fetchMock.mock.calls[3]?.[0])).toMatch(/\/files\/[a-f0-9]{64}$/);
    expect(scan.summary).toMatchObject({
      status: "completed",
      malicious: 0,
      suspicious: 1,
      threatVerdict: "VERDICT_SUSPICIOUS"
    });
    expect(scan.findings).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^virustotal-suspicious-[a-f0-9]{16}$/),
        severity: "medium",
        title: "VirusTotal (suspicious)",
        message: "Cynet Security classified this package as suspicious."
      })
    );
  });

  test("falls back to aggregate findings when engine details are missing", async () => {
    configureVirusTotal();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          attributes: {
            last_analysis_stats: {
              malicious: 1,
              suspicious: 0,
              harmless: 0,
              undetected: 0
            }
          }
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const scan = await runVirusTotalScan(snapshot);

    expect(scan.findings).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^virustotal-malicious-/),
        severity: "high",
        title: "VirusTotal detected malicious content"
      })
    );
  });

  test("records a failed scan summary and rejects publish", async () => {
    configureVirusTotal();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    const report = await reviewSkillSnapshot(snapshot, undefined, evaluation());

    expect(report.virusTotal).toMatchObject({
      provider: "virustotal",
      status: "failed",
      error: "fetch failed"
    });
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: "virustotal-scan-failed",
        severity: "high"
      })
    );
    expect(report.verdict).toBe("rejected");
  });
});
