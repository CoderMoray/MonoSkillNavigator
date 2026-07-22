import type { ReviewScores } from "../lib/types";

const rows: Array<[keyof ReviewScores, string]> = [
  ["complianceScore", "合规"],
  ["securityScore", "安全"],
  ["privacyScore", "隐私"],
  ["qualityScore", "质量"],
  ["reliabilityScore", "可靠性"]
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
