import type { FunctionalEvaluationReport } from "./types";

export interface HaluCatchRadarDimension {
  key: string;
  label: string;
  taskPrefix: string;
}

export const HALUCATCH_RADAR_DIMENSIONS: HaluCatchRadarDimension[] = [
  { key: "foundation", label: "地基", taskPrefix: "HaluCatch · 地基与数据管线" },
  { key: "code", label: "代码", taskPrefix: "HaluCatch · 代码风险" },
  { key: "rules", label: "规则", taskPrefix: "HaluCatch · 规则与方法论" },
  { key: "guardrails", label: "护栏", taskPrefix: "HaluCatch · 解读护栏" },
  { key: "complexity", label: "复杂度", taskPrefix: "HaluCatch · 复杂度与可维护性" }
];

export type HaluCatchRadarScores = Record<(typeof HALUCATCH_RADAR_DIMENSIONS)[number]["key"], number>;

export function extractHaluCatchRadarScores(
  evaluation: FunctionalEvaluationReport | undefined
): HaluCatchRadarScores | null {
  if (!evaluation || evaluation.provider !== "halucatch-adapter") {
    return null;
  }

  const scores = {} as HaluCatchRadarScores;
  for (const dimension of HALUCATCH_RADAR_DIMENSIONS) {
    const task = evaluation.taskResults.find((item) => item.name.startsWith(dimension.taskPrefix));
    scores[dimension.key as keyof HaluCatchRadarScores] = task?.score ?? 0;
  }
  return scores;
}

export function averageHaluCatchRadarScores(
  evaluations: FunctionalEvaluationReport[]
): HaluCatchRadarScores | undefined {
  const haluCatchEvaluations = evaluations.filter((item) => item.provider === "halucatch-adapter");
  if (haluCatchEvaluations.length === 0) {
    return undefined;
  }

  const totals = Object.fromEntries(HALUCATCH_RADAR_DIMENSIONS.map((dim) => [dim.key, 0])) as HaluCatchRadarScores;
  for (const evaluation of haluCatchEvaluations) {
    const scores = extractHaluCatchRadarScores(evaluation);
    if (!scores) {
      continue;
    }
    for (const dimension of HALUCATCH_RADAR_DIMENSIONS) {
      totals[dimension.key as keyof HaluCatchRadarScores] += scores[dimension.key as keyof HaluCatchRadarScores];
    }
  }

  const count = haluCatchEvaluations.length;
  return Object.fromEntries(
    HALUCATCH_RADAR_DIMENSIONS.map((dim) => [dim.key, Math.round(totals[dim.key as keyof HaluCatchRadarScores] / count)])
  ) as HaluCatchRadarScores;
}
