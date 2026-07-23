"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, GitBranch, LinkIcon } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { SkillCard } from "../../../components/SkillCard";
import { getLeaderboard } from "../../../lib/api";
import { aggregateCreators, normalizeHandle, type CreatorSummary } from "../../../lib/creators";
import { formatNumber } from "../../../lib/format";

export default function CreatorProfilePage() {
  const params = useParams<{ username: string }>();
  const handle = normalizeHandle(decodeURIComponent(params.username));
  const [creator, setCreator] = useState<CreatorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const skills = await getLeaderboard("downloads", 100);
        const matched = aggregateCreators(skills).find((item) => item.handle === handle) ?? null;
        if (!cancelled) {
          setCreator(matched);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const topSkillNames = useMemo(() => creator?.skills.slice(0, 3).map((skill) => skill.name).join(" · "), [creator]);

  if (loading) {
    return (
      <AppShell title={`@${handle}`}>
        <div className="skeleton" />
      </AppShell>
    );
  }

  if (error || !creator) {
    return (
      <AppShell title={`@${handle}`}>
        <div className="page-stack">
          <Link className="button secondary" href="/creators" style={{ width: "fit-content" }}>
            <ArrowLeft size={16} /> 返回 Creators
          </Link>
          <div className="error">{error ?? "Creator 不存在"}</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={`@${creator.handle}`}>
      <div className="market-stack">
        <Link className="button secondary" href="/creators" style={{ width: "fit-content" }}>
          <ArrowLeft size={16} /> 返回 Creators
        </Link>

        <section className="profile-layout">
          <aside className="profile-card">
            <div className="profile-avatar">{creator.name.slice(0, 1).toUpperCase()}</div>
            <div>
              <div className="profile-name-row">
                <h1>{creator.name}</h1>
              </div>
              <p>@{creator.handle}</p>
            </div>

            <div className="profile-stat-grid">
              <div>
                <strong>{formatNumber(creator.downloads)}</strong>
                <span>downloads</span>
              </div>
              <div>
                <strong>{creator.averageRating ? creator.averageRating.toFixed(1) : "new"}</strong>
                <span>stars</span>
              </div>
              <div>
                <strong>{formatNumber(creator.published)}</strong>
                <span>published</span>
              </div>
            </div>

            <div className="profile-meta">
              <h2>About</h2>
              <p>{topSkillNames ? `Publisher behind ${topSkillNames}.` : "Publisher on SkillHub."}</p>
              <h2>Organizations</h2>
              <p>SkillHub</p>
              <h2>Links</h2>
              <div className="tag-row">
                <span className="badge"><GitBranch size={13} /> GitHub</span>
                <span className="badge"><LinkIcon size={13} /> Website</span>
              </div>
            </div>
          </aside>

          <section className="profile-content">
            <div className="market-toolbar">
              <div className="segmented">
                <button className="active" type="button">Skills {creator.published}</button>
                <button type="button">Plugins 0</button>
                <button type="button">Starred {creator.ratingCount}</button>
              </div>
            </div>
            <div className="claw-list">
              {creator.skills.map((skill) => (
                <SkillCard key={skill.slug} skill={skill} variant="row" />
              ))}
            </div>
          </section>
        </section>
      </div>
    </AppShell>
  );
}
