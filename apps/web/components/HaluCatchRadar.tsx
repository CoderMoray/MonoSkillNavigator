import type { FunctionalEvaluationReport } from "../lib/types";
import { HALUCATCH_RADAR_DIMENSIONS, extractHaluCatchRadarScores } from "../lib/halucatch-scores";
import { ScoreRadar } from "./ScoreRadar";

interface HaluCatchRadarProps {
  evaluation: FunctionalEvaluationReport | undefined;
  averageScores?: Record<string, number>;
  sampleSize?: number;
}

export function HaluCatchRadar({ evaluation, averageScores, sampleSize }: HaluCatchRadarProps) {
  const scores = extractHaluCatchRadarScores(evaluation);
  if (!scores) {
    return <div className="empty detail-empty">暂无 HaluCatch 五维评估数据。</div>;
  }

  return (
    <ScoreRadar
      ariaLabel="HaluCatch 五维质量雷达图，含当前 Skill 与平台均值对比"
      averageScores={averageScores}
      dimensions={HALUCATCH_RADAR_DIMENSIONS.map(({ key, label }) => ({ key, label }))}
      sampleSize={sampleSize}
      scores={scores}
    />
  );
}
