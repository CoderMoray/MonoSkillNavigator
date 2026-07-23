"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award, Download, ShieldCheck, Star, Trophy } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { VerdictBadge } from "../../components/StatusBadge";
import { getLeaderboard } from "../../lib/api";
import { formatDateTime, formatNumber } from "../../lib/format";
import type { SkillSearchResult } from "../../lib/types";

const sortOptions = [
  { value: "reliability", label: "可靠性分", icon: Award },
  { value: "quality", label: "质量分", icon: Trophy },
  { value: "security", label: "安全分", icon: ShieldCheck },
  { value: "rating", label: "用户评分", icon: Star },
  { value: "downloads", label: "下载量", icon: Download },
  { value: "recent", label: "最近更新", icon: Trophy }
];

export default function LeaderboardPage() {
  const [items, setItems] = useState<SkillSearchResult[]>([]);
  const [sort, setSort] = useState("reliability");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getLeaderboard(sort, 30);
        if (!cancelled) {
          setItems(data);
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
  }, [sort]);

  return (
    <AppShell title="榜单">
      <div className="page-stack">
        <section className="section-head">
          <div>
            <span className="eyebrow">
              <Trophy size={14} />
              Leaderboard
            </span>
            <h2 style={{ marginTop: 14 }}>Skill 榜单</h2>
            <p>按照不同质量信号排序，帮助团队优先发现可靠 Skill。</p>
          </div>
          <label className="select-wrap">
            <select className="select" onChange={(event) => setSort(event.target.value)} value={sort}>
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        {error ? <div className="error">{error}。请确认 API 已通过 npm run dev:api 启动。</div> : null}

        <div className="card">
          {loading ? (
            <div className="loading-grid">
              {Array.from({ length: 3 }).map((_, index) => (
                <div className="skeleton" key={index} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="empty">暂无榜单数据。</div>
          ) : (
            <ul className="list">
              {items.map((item, index) => (
                <li className="list-item" key={item.slug}>
                  <div className="card-head">
                    <div>
                      <Link href={`/skills/${encodeURIComponent(item.slug)}`}>
                        <strong>#{index + 1} {item.name}</strong>
                      </Link>
                      <p className="description">
                        质量 {item.scores.qualityScore} · 安全 {item.scores.securityScore} · 可靠性{" "}
                        {item.scores.reliabilityScore}
                      </p>
                    </div>
                    <VerdictBadge verdict={item.status} />
                  </div>
                  <div className="tag-row">
                    <span className="badge">
                      <Star size={13} /> {item.averageRating ? item.averageRating.toFixed(1) : "暂无评分"}
                    </span>
                    <span className="badge">
                      <Download size={13} /> {formatNumber(item.downloads)}
                    </span>
                    <span className="badge">更新 {formatDateTime(item.updatedAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
