import type { ReviewScores } from "../lib/types";

const rows: Array<[keyof ReviewScores, string]> = [
  ["overallScore", "综合"],
  ["qualityScore", "质量"],
  ["securityScore", "安全"],
  ["privacyScore", "隐私"],
  ["functionalScore", "功能"]
];

export function ScoreBars({ scores }: { scores: ReviewScores }) {
  return (
    <div className="score-line">
      {rows.map(([key, label]) => (
        <div className="score-item" key={key}>
          <span>{label}</span>
          <div className="bar">
            <span style={{ width: `${scores[key]}%` }} />
          </div>
          <strong>{scores[key]}</strong>
        </div>
      ))}
    </div>
  );
}
