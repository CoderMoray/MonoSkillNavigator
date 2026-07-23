import { describe, expect, test } from "vitest";
import { reviewSkillSnapshot } from "@skill-platform/review-engine";
import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import type { SkillSnapshot } from "@skill-platform/skill-spec";

const snapshot: SkillSnapshot = {
  manifest: {
    slug: "score-dimensions",
    name: "Score dimensions",
    description: "Use when you need a stable fixture for review score tests.",
    version: "1.0.0",
    license: "MIT-0",
    tags: ["testing"]
  },
  readme:
    "# Score dimensions\n\nUse this documented workflow to produce a consistent result. Expected output: a concise summary with clear constraints and acceptance criteria.",
  files: [
    {
      path: "SKILL.md",
      content:
        "---\nslug: score-dimensions\nname: Score dimensions\ndescription: Use when you need a stable fixture for review score tests.\nversion: 1.0.0\nlicense: MIT-0\ntags:\n  - testing\n---\n# Score dimensions\n\nExpected output: a concise summary with clear constraints and acceptance criteria.\n",
      size: 300,
      sha256: "skill-md"
    },
    {
      path: "tests/basic.json",
      content: '{"name":"basic"}',
      size: 16,
      sha256: "test-json"
    },
    {
      path: "examples/output.md",
      content: "# Example\n\nA concise summary.",
      size: 30,
      sha256: "example-md"
    }
  ],
  contentHash: "score-dimensions-hash",
  createdAt: "2026-01-01T00:00:00.000Z"
};

function evaluation(score: number): FunctionalEvaluationReport {
  return {
    id: `evaluation-${score}`,
    provider: "halucatch-adapter",
    status: score >= 80 ? "passed" : "failed",
    score,
    tasksTotal: 5,
    tasksPassed: score >= 80 ? 5 : 0,
    taskResults: [],
    findings: [],
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

describe("review score dimensions", () => {
  test("keeps HaluCatch out of quality and mirrors evaluator score in reliability", async () => {
    const previous = process.env.SKILLSPECTOR_ENABLED;
    process.env.SKILLSPECTOR_ENABLED = "false";
    try {
      const lowReliability = await reviewSkillSnapshot(snapshot, undefined, evaluation(62));
      const highReliability = await reviewSkillSnapshot(snapshot, undefined, evaluation(90));

      expect(lowReliability.scores.qualityScore).toBe(highReliability.scores.qualityScore);
      expect(lowReliability.scores.complianceScore).toBe(highReliability.scores.complianceScore);
      expect(lowReliability.scores.reliabilityScore).toBe(62);
      expect(highReliability.scores.reliabilityScore).toBe(90);
      expect(lowReliability.scores).not.toHaveProperty("overallScore");
      expect(lowReliability.scores).not.toHaveProperty("functionalScore");
    } finally {
      if (previous === undefined) {
        delete process.env.SKILLSPECTOR_ENABLED;
      } else {
        process.env.SKILLSPECTOR_ENABLED = previous;
      }
    }
  });
});
