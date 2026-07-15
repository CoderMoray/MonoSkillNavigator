import Link from "next/link";
import { Download, MessageSquare, Star, Users } from "lucide-react";
import { formatDateTime, formatNumber } from "../lib/format";
import type { SkillSearchResult } from "../lib/types";
import { ScoreBars } from "./ScoreBars";
import { VerdictBadge } from "./StatusBadge";

export function SkillCard({ skill, variant = "card" }: { skill: SkillSearchResult; variant?: "card" | "row" }) {
  const owner = skill.contributors.find((item) => item.role === "owner") ?? skill.contributors[0];

  if (variant === "row") {
    return (
      <Link className="skill-row" href={`/skills/${encodeURIComponent(skill.slug)}`}>
        <div className="skill-row-main">
          <div className="skill-icon">{skill.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="skill-row-title">
              <strong>{skill.name}</strong>
              <span>@{owner?.username ?? owner?.name ?? "unknown"}</span>
            </div>
            <p>{skill.description}</p>
          </div>
        </div>
        <div className="skill-row-metrics">
          <span>
            <Star size={13} /> {skill.averageRating ? skill.averageRating.toFixed(1) : "new"}
          </span>
          <span>
            <Download size={13} /> {formatNumber(skill.downloads)}
          </span>
          <VerdictBadge verdict={skill.status} />
        </div>
      </Link>
    );
  }

  return (
    <Link className="skill-card" href={`/skills/${encodeURIComponent(skill.slug)}`}>
      <div className="card-head">
        <div>
          <h3 className="skill-title">{skill.name}</h3>
          <div className="mono">latest@{skill.latestVersion}</div>
        </div>
        <VerdictBadge verdict={skill.status} />
      </div>

      <p className="description">{skill.description}</p>

      <div className="tag-row">
        <span className="badge">
          <Star size={13} />
          {skill.averageRating ? skill.averageRating.toFixed(1) : "暂无评分"}
        </span>
        <span className="badge">
          <Download size={13} />
          {formatNumber(skill.downloads)}
        </span>
        <span className="badge">
          <MessageSquare size={13} />
          {skill.openIssues} issues
        </span>
      </div>

      <div style={{ marginTop: 18 }}>
        <ScoreBars scores={skill.scores} />
      </div>

      <div className="card-foot">
        <span>
          <Users size={13} style={{ verticalAlign: "-2px" }} /> {owner?.name ?? "unknown"}
        </span>
        <span>{formatDateTime(skill.updatedAt)}</span>
      </div>
    </Link>
  );
}
