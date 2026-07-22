"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, Trophy, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { SkillCard } from "../../components/SkillCard";
import { getLeaderboard, getSkills } from "../../lib/api";
import type { SkillSearchResult } from "../../lib/types";

const categories = ["All categories", "Security", "Automation", "Docs", "Developer", "Productivity"];
const tabs = ["Skills", "Plugins", "Creators"];

export default function SkillsPage() {
  const router = useRouter();
  const [skills, setSkills] = useState<SkillSearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [tab, setTab] = useState("Skills");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    setQuery(url.searchParams.get("query") ?? "");
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.key === "k" || event.key === "K") && !event.metaKey && !event.ctrlKey && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const items = query.trim() ? await getSkills(query) : await getLeaderboard(sort, 50);
        if (!cancelled) {
          setSkills(items);
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

    const timeout = window.setTimeout(load, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query, sort]);

  return (
    <AppShell title="Skill 广场">
      <div className="page-stack">
        <section className="section-head">
          <div>
            <span className="eyebrow">
              <Sparkles size={14} />
              Skills marketplace
            </span>
            <h2 style={{ marginTop: 14 }}>Discover skills and plugins from trusted creators</h2>
            <p>浏览已发布 Skill、查看评分、下载量和安全状态，点击条目进入详情页。</p>
          </div>
          <Link className="button primary" href="/skills/publish">
            <UploadCloud size={15} /> Publish
          </Link>
        </section>

        <section className="market-panel">
          <div className="market-toolbar">
            <div className="segmented">
              {tabs.map((item) => (
                <button
                  className={tab === item ? "active" : ""}
                  key={item}
                  onClick={() => (item === "Creators" ? router.push("/creators") : setTab(item))}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="category-row">
              {categories.map((category) => (
                <span className="category-chip" key={category}>{category}</span>
              ))}
            </div>
          </div>

          <div className="toolbar inset">
            <div className="searchbox">
            <Search size={17} color="var(--muted)" />
            <input
              aria-label="搜索 Skill"
              ref={searchInputRef}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by skill name, creator, description...  Press K"
              value={query}
            />
            </div>
            <label className="select-wrap">
              <Trophy size={16} />
              <select className="select" disabled={Boolean(query.trim())} onChange={(event) => setSort(event.target.value)} value={sort}>
                <option value="recent">New</option>
                <option value="reliability">Reliability</option>
                <option value="compliance">Compliance</option>
                <option value="security">Security</option>
                <option value="privacy">Privacy</option>
                <option value="quality">Quality</option>
                <option value="rating">Rating</option>
                <option value="downloads">Trending</option>
              </select>
            </label>
          </div>
        </section>

        {error ? <div className="error">{error}。请确认 API 已通过 npm run dev:api 启动。</div> : null}

        {tab !== "Skills" ? (
          <div className="empty">{tab} 页面正在建设中，当前先开放 Skills 市场。</div>
        ) : loading ? (
          <div className="claw-list">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="skill-row skeleton-row" key={index} />
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="empty">暂无匹配 Skill。可以先登录后运行 npm run skill -- publish examples/demo-skill。</div>
        ) : (
          <div className="claw-list">
            {skills.map((skill) => (
              <SkillCard key={skill.slug} skill={skill} variant="row" />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
