import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { evaluateSkillSnapshot } from "@skill-platform/evaluator";
import { readSkillPackage } from "@skill-platform/skill-spec";

const pythonCommand =
  process.env.HALUCATCH_PYTHON ??
  (process.platform === "win32" ? "python" : "python3");
const canRunHaluCatch =
  process.env.HALUCATCH_ENABLED?.toLowerCase() !== "false" &&
  spawnSync(pythonCommand, ["--version"], { stdio: "ignore" }).status === 0;

describe("HaluCatch evaluator adapter", () => {
  const evaluate = canRunHaluCatch ? test : test.skip;

  evaluate("maps five HaluCatch reliability dimensions into the shared report", async () => {
    const snapshot = await readSkillPackage(resolve("examples/demo-skill"));
    const report = await evaluateSkillSnapshot(snapshot);

    expect(report.provider).toBe("halucatch-adapter");
    expect(report.tasksTotal).toBe(5);
    expect(report.taskResults).toHaveLength(5);
    expect(report.taskResults.map((task) => task.name)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("地基与数据管线"),
        expect.stringContaining("代码风险"),
        expect.stringContaining("规则与方法论"),
        expect.stringContaining("解读护栏"),
        expect.stringContaining("复杂度与可维护性")
      ])
    );
    expect(report.haluCatchReport).toBeDefined();
    expect(report.haluCatchReport?.professional).toContain("HaluCatch");
    expect(report.haluCatchReport?.simple.length).toBeGreaterThan(100);
    expect(report.haluCatchReport?.action.length).toBeGreaterThan(50);
    expect(report.haluCatchReport?.skillType).toBeTruthy();
  });
});
