import type { SkillFile, SkillSnapshot } from "@skill-platform/skill-spec";
import { isSkillEntryPath } from "@skill-platform/skill-spec/skill-format";

export type EvaluationProvider = "static-taskset" | "halucatch-adapter";
export type EvaluationStatus = "passed" | "partial" | "failed" | "not-configured";

export interface FunctionalTestTask {
  name: string;
  input?: string;
  expectedOutput?: string[];
  forbiddenBehaviors?: string[];
  successCriteria?: string[];
}

export interface FunctionalEvaluationFinding {
  id: string;
  task?: string;
  severity: "low" | "medium" | "high";
  message: string;
  recommendation: string;
}

export interface FunctionalEvaluationTaskResult {
  name: string;
  score: number;
  findings: FunctionalEvaluationFinding[];
}

export interface FunctionalEvaluationReport {
  id: string;
  provider: EvaluationProvider;
  status: EvaluationStatus;
  score: number;
  tasksTotal: number;
  tasksPassed: number;
  taskResults: FunctionalEvaluationTaskResult[];
  findings: FunctionalEvaluationFinding[];
  createdAt: string;
}

export function evaluateSkillSnapshot(snapshot: SkillSnapshot): FunctionalEvaluationReport {
  const tasks = readTaskSet(snapshot);

  if (tasks.length === 0) {
    const finding: FunctionalEvaluationFinding = {
      id: "taskset-missing",
      severity: "medium",
      message: "No JSON task set was found under tests/.",
      recommendation: "Add tests/*.json with name, input, expectedOutput, and forbiddenBehaviors."
    };

    return buildReport(snapshot, "not-configured", 0, [], [finding]);
  }

  const taskResults = tasks.map((task) => evaluateTask(snapshot, task));
  const findings = taskResults.flatMap((result) => result.findings);
  const score = Math.round(
    taskResults.reduce((total, result) => total + result.score, 0) / taskResults.length
  );
  const tasksPassed = taskResults.filter((result) => result.score >= 80).length;
  const status = score >= 80 ? "passed" : score >= 50 ? "partial" : "failed";

  return buildReport(snapshot, status, score, taskResults, findings, tasksPassed);
}

function readTaskSet(snapshot: SkillSnapshot): FunctionalTestTask[] {
  const tasks: FunctionalTestTask[] = [];

  for (const file of snapshot.files.filter((item) => item.path.startsWith("tests/") && item.path.endsWith(".json"))) {
    const parsed = parseTaskFile(file);
    tasks.push(...parsed);
  }

  return tasks;
}

function parseTaskFile(file: SkillFile): FunctionalTestTask[] {
  try {
    const parsed = JSON.parse(file.content) as FunctionalTestTask | FunctionalTestTask[];
    return Array.isArray(parsed) ? parsed.map(normalizeTask) : [normalizeTask(parsed)];
  } catch {
    return [
      {
        name: file.path,
        successCriteria: ["Invalid JSON task file"]
      }
    ];
  }
}

function normalizeTask(task: FunctionalTestTask): FunctionalTestTask {
  return {
    ...task,
    name: task.name || "unnamed-task",
    expectedOutput: normalizeStringList(task.expectedOutput),
    forbiddenBehaviors: normalizeStringList(task.forbiddenBehaviors),
    successCriteria: normalizeStringList(task.successCriteria)
  };
}

function evaluateTask(snapshot: SkillSnapshot, task: FunctionalTestTask): FunctionalEvaluationTaskResult {
  const findings: FunctionalEvaluationFinding[] = [];
  let score = 100;

  if (!task.input || task.input.trim().length === 0) {
    score -= 20;
    findings.push({
      id: "task-input-missing",
      task: task.name,
      severity: "medium",
      message: "Task input is missing.",
      recommendation: "Add a realistic user input to the task."
    });
  }

  if (!task.expectedOutput?.length && !task.successCriteria?.length) {
    score -= 35;
    findings.push({
      id: "expected-output-missing",
      task: task.name,
      severity: "medium",
      message: "Task does not define expected output or success criteria.",
      recommendation: "Add expectedOutput or successCriteria so the evaluator can score the behavior."
    });
  }

  if (!task.forbiddenBehaviors?.length) {
    score -= 15;
    findings.push({
      id: "forbidden-behaviors-missing",
      task: task.name,
      severity: "low",
      message: "Task does not define forbidden behaviors.",
      recommendation: "Add forbiddenBehaviors to make safety boundaries explicit."
    });
  }

  const searchableContent = snapshot.files
    .filter((file) => isSkillEntryPath(file.path) || file.path.startsWith("examples/"))
    .map((file) => file.content)
    .join("\n")
    .toLowerCase();

  for (const expected of task.expectedOutput ?? []) {
    if (!containsLoose(searchableContent, expected)) {
      score -= 5;
      findings.push({
        id: "expected-output-not-documented",
        task: task.name,
        severity: "low",
        message: `Expected output cue is not documented: ${expected}`,
        recommendation: "Mention the expected output shape in SKILL.md or examples/."
      });
    }
  }

  for (const forbidden of task.forbiddenBehaviors ?? []) {
    if (!containsLoose(searchableContent, forbidden)) {
      score -= 5;
      findings.push({
        id: "forbidden-behavior-not-documented",
        task: task.name,
        severity: "low",
        message: `Forbidden behavior is not documented: ${forbidden}`,
        recommendation: "Document safety boundaries in SKILL.md or tests/."
      });
    }
  }

  return {
    name: task.name,
    score: clampScore(score),
    findings
  };
}

function buildReport(
  snapshot: SkillSnapshot,
  status: EvaluationStatus,
  score: number,
  taskResults: FunctionalEvaluationTaskResult[],
  findings: FunctionalEvaluationFinding[],
  tasksPassed = 0
): FunctionalEvaluationReport {
  return {
    id: `eval_${snapshot.contentHash.slice(0, 16)}_${Date.now()}`,
    provider: "static-taskset",
    status,
    score,
    tasksTotal: taskResults.length,
    tasksPassed,
    taskResults,
    findings,
    createdAt: new Date().toISOString()
  };
}

function normalizeStringList(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function containsLoose(content: string, value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim();
  if (!normalized) {
    return true;
  }

  return normalized.split(/\s+/).every((token) => content.includes(token));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
