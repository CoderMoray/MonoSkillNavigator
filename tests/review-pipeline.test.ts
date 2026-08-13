import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { reviewAndEvaluateSkillSnapshot } from "@skill-platform/review-engine";
import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import { readSkillPackage, type SkillSnapshot } from "@skill-platform/skill-spec";

const configuredVariables = [
  "SKILLSPECTOR_ENABLED",
  "VIRUSTOTAL_ENABLED",
  "HALUCATCH_ENABLED"
] as const;
const originalEnvironment = new Map(
  configuredVariables.map((name) => [name, process.env[name]])
);

let snapshot: SkillSnapshot;

function haluCatchEvaluation(status: FunctionalEvaluationReport["status"]): FunctionalEvaluationReport {
  return {
    id: `halucatch-${status}`,
    provider: "halucatch-adapter",
    status,
    score: status === "failed" ? 0 : 80,
    tasksTotal: 5,
    tasksPassed: status === "failed" ? 0 : 5,
    taskResults: [],
    findings: [],
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function staticEvaluation(): FunctionalEvaluationReport {
  return {
    id: "static-evaluation",
    provider: "static-taskset",
    status: "passed",
    score: 100,
    tasksTotal: 1,
    tasksPassed: 1,
    taskResults: [],
    findings: [],
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

beforeAll(async () => {
  snapshot = await readSkillPackage(resolve("examples/demo-skill"));
});

afterEach(() => {
  for (const [name, value] of originalEnvironment) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("review pipeline completion", () => {
  test("requires HaluCatch when that configured stage falls back", async () => {
    process.env.SKILLSPECTOR_ENABLED = "false";
    process.env.VIRUSTOTAL_ENABLED = "false";
    process.env.HALUCATCH_ENABLED = "true";

    const { failedStages } = await reviewAndEvaluateSkillSnapshot(snapshot, undefined, staticEvaluation());

    expect(failedStages).toEqual([
      expect.objectContaining({
        stage: "halucatch",
        message: expect.stringMatching(/did not complete/i)
      })
    ]);
  });

  test("does not treat a completed low-quality HaluCatch result as a retryable stage failure", async () => {
    process.env.SKILLSPECTOR_ENABLED = "false";
    process.env.VIRUSTOTAL_ENABLED = "false";
    process.env.HALUCATCH_ENABLED = "true";

    const { evaluation, failedStages } = await reviewAndEvaluateSkillSnapshot(
      snapshot,
      undefined,
      haluCatchEvaluation("failed")
    );

    expect(evaluation.status).toBe("failed");
    expect(failedStages).toEqual([]);
  });
});
