import type { RadarDimension, RadarScores } from "../lib/radar-chart";

const SIZE = 320;
const CENTER = SIZE / 2;
const MAX_RADIUS = 108;
const LABEL_RADIUS = 132;

function polarToCartesian(angleIndex: number, total: number, radius: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (angleIndex * 2 * Math.PI) / total;
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle)
  };
}

function ringPoints(dimensions: RadarDimension[], radius: number): string {
  return dimensions
    .map((_, index) => {
      const { x, y } = polarToCartesian(index, dimensions.length, radius);
      return `${x},${y}`;
    })
    .join(" ");
}

function scorePolygon(dimensions: RadarDimension[], scores: RadarScores): string {
  return dimensions
    .map(({ key }, index) => {
      const radius = ((scores[key] ?? 0) / 100) * MAX_RADIUS;
      const { x, y } = polarToCartesian(index, dimensions.length, radius);
      return `${x},${y}`;
    })
    .join(" ");
}

export interface ScoreRadarProps {
  dimensions: RadarDimension[];
  scores: RadarScores;
  averageScores?: RadarScores;
  sampleSize?: number;
  ariaLabel?: string;
}

export function ScoreRadar({
  dimensions,
  scores,
  averageScores,
  sampleSize,
  ariaLabel = "雷达图"
}: ScoreRadarProps) {
  if (dimensions.length < 3) {
    return null;
  }

  const polygon = scorePolygon(dimensions, scores);
  const averagePolygon = averageScores ? scorePolygon(dimensions, averageScores) : undefined;
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

      <svg aria-label={ariaLabel} className="score-radar-chart" role="img" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {gridLevels.map((level) => (
          <polygon
            className="score-radar-grid"
            key={level}
            points={ringPoints(dimensions, (level / 100) * MAX_RADIUS)}
          />
        ))}

        {dimensions.map((_, index) => {
          const { x, y } = polarToCartesian(index, dimensions.length, MAX_RADIUS);
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
          const { x, y } = polarToCartesian(index, dimensions.length, LABEL_RADIUS);
          return (
            <g className="score-radar-label" key={key}>
              <text className="score-radar-label-name" textAnchor="middle" x={x} y={y - 6}>
                {label}
              </text>
              <text className="score-radar-label-value" textAnchor="middle" x={x} y={y + 12}>
                {scores[key] ?? 0}
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
              <strong className="score-radar-legend-current">{scores[key] ?? 0}</strong>
              {averageScores ? (
                <span className="score-radar-legend-average">均值 {averageScores[key] ?? 0}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
