import type { ReviewScores } from "../lib/types";

const dimensions: Array<{ key: keyof ReviewScores; label: string }> = [
  { key: "qualityScore", label: "质量" },
  { key: "securityScore", label: "安全" },
  { key: "reliabilityScore", label: "可靠性" }
];

const SIZE = 320;
const CENTER = SIZE / 2;
const MAX_RADIUS = 108;
const LABEL_RADIUS = 132;

function polarToCartesian(angleIndex: number, radius: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (angleIndex * 2 * Math.PI) / dimensions.length;
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle)
  };
}

function ringPoints(radius: number): string {
  return dimensions
    .map((_, index) => {
      const { x, y } = polarToCartesian(index, radius);
      return `${x},${y}`;
    })
    .join(" ");
}

function scorePolygon(scores: ReviewScores): string {
  return dimensions
    .map(({ key }, index) => {
      const radius = (scores[key] / 100) * MAX_RADIUS;
      const { x, y } = polarToCartesian(index, radius);
      return `${x},${y}`;
    })
    .join(" ");
}

interface ScoreRadarProps {
  scores: ReviewScores;
  averageScores?: ReviewScores;
  sampleSize?: number;
}

export function ScoreRadar({ scores, averageScores, sampleSize }: ScoreRadarProps) {
  const polygon = scorePolygon(scores);
  const averagePolygon = averageScores ? scorePolygon(averageScores) : undefined;
  const gridLevels = [25, 50, 75, 100];

  return (
    <div className="score-radar">
      <div className="score-radar-head">
        <div className="score-radar-keys">
          <span className="score-radar-key score-radar-key-current">
            <i aria-hidden="true" />
            当前 Skill
          </span>
          {averageScores ? (
            <span className="score-radar-key score-radar-key-average">
              <i aria-hidden="true" />
              平台均值{sampleSize ? ` (${sampleSize})` : ""}
            </span>
          ) : null}
        </div>
      </div>

      <svg
        aria-label="三维审查分数雷达图，含当前 Skill 与平台均值对比"
        className="score-radar-chart"
        role="img"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
      >
        {gridLevels.map((level) => (
          <polygon
            className="score-radar-grid"
            key={level}
            points={ringPoints((level / 100) * MAX_RADIUS)}
          />
        ))}

        {dimensions.map((_, index) => {
          const { x, y } = polarToCartesian(index, MAX_RADIUS);
          return <line className="score-radar-axis" key={index} x1={CENTER} x2={x} y1={CENTER} y2={y} />;
        })}

        {averagePolygon ? (
          <>
            <polygon className="score-radar-area score-radar-area-average" points={averagePolygon} />
            <polygon className="score-radar-outline score-radar-outline-average" points={averagePolygon} />
          </>
        ) : null}

        <polygon className="score-radar-area score-radar-area-current" points={polygon} />
        <polygon className="score-radar-outline score-radar-outline-current" points={polygon} />

        {dimensions.map(({ key, label }, index) => {
          const { x, y } = polarToCartesian(index, LABEL_RADIUS);
          return (
            <g className="score-radar-label" key={key}>
              <text className="score-radar-label-name" textAnchor="middle" x={x} y={y - 6}>
                {label}
              </text>
              <text className="score-radar-label-value" textAnchor="middle" x={x} y={y + 12}>
                {scores[key]}
              </text>
            </g>
          );
        })}
      </svg>

      <ul className="score-radar-legend">
        {dimensions.map(({ key, label }) => (
          <li key={key}>
            <span>{label}</span>
            <div className="score-radar-legend-values">
              <strong className="score-radar-legend-current">{scores[key]}</strong>
              {averageScores ? (
                <span className="score-radar-legend-average">均值 {averageScores[key]}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
