"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, KeyRound, LogOut } from "lucide-react";
import { SkillCard } from "./SkillCard";
import { clearAuthToken, getAuthToken } from "../lib/auth-token";
import { logoutUser } from "../lib/api";
import { normalizeHandle, type CreatorSummary } from "../lib/creators";
import { formatDateTime, formatNumber } from "../lib/format";
import type { PublicUser } from "../lib/types";

type CreatorProfileTab = "skills" | "plugins" | "starred";

const profileTabs: Array<{ id: CreatorProfileTab; label: (creator: CreatorSummary) => string }> = [
  { id: "skills", label: (creator) => `Skills ${creator.published}` },
  { id: "plugins", label: () => "Plugins 0" },
  { id: "starred", label: () => "Starred 0" }
];

interface CreatorProfileViewProps {
  creator: CreatorSummary;
  viewer?: PublicUser | null;
  showBackLink?: boolean;
}

export function CreatorProfileView({ creator, viewer = null, showBackLink = true }: CreatorProfileViewProps) {
  const [activeTab, setActiveTab] = useState<CreatorProfileTab>("skills");
  const isOwner = Boolean(viewer && normalizeHandle(viewer.username) === creator.handle);
  const topSkillNames = creator.skills
    .slice(0, 3)
    .map((skill) => skill.name)
    .join(" · ");

  async function handleLogout() {
    const token = getAuthToken();
    clearAuthToken();
    if (token) {
      await logoutUser(token).catch(() => undefined);
    }
    window.location.href = "/";
  }

  return (
    <div className="market-stack">
      {showBackLink ? (
        <Link className="button secondary" href="/creators" style={{ width: "fit-content" }}>
          返回 Creators
        </Link>
      ) : null}

      <section className="profile-layout">
        <aside className="profile-card">
          <div className="profile-avatar">{creator.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="profile-name-row">
              <h1>{creator.name}</h1>
              {isOwner && viewer?.role === "admin" ? <BadgeCheck color="var(--blue)" size={20} /> : null}
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
            <p>
              {topSkillNames
                ? `Publisher behind ${topSkillNames}.`
                : isOwner && viewer?.role === "admin"
                  ? "Platform administrator."
                  : "Publisher on MonoSkillNavigator."}
            </p>
            {isOwner && viewer ? (
              <>
                <h2>Account</h2>
                <div className="tag-row">
                  <span className="badge">ID {viewer.id.slice(0, 8)}</span>
                  <span className="badge">创建 {formatDateTime(viewer.createdAt)}</span>
                  <span className="badge">更新 {formatDateTime(viewer.updatedAt)}</span>
                </div>
              </>
            ) : null}
          </div>

          {isOwner ? (
            <div className="hero-actions">
              <Link className="button secondary" href="/account/change-password">
                <KeyRound size={15} /> 修改密码
              </Link>
              <button className="button secondary" onClick={handleLogout} type="button">
                <LogOut size={15} /> 登出
              </button>
            </div>
          ) : null}
        </aside>

        <section className="profile-content">
          <div className="market-toolbar">
            <div className="segmented">
              {profileTabs.map((tab) => (
                <button
                  className={activeTab === tab.id ? "active" : ""}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  {tab.label(creator)}
                </button>
              ))}
            </div>
          </div>

          {activeTab === "skills" ? (
            creator.skills.length === 0 ? (
              <div className="empty">
                {isOwner
                  ? "暂无发布记录。可通过 CLI 或「添加 Skill」发布文件夹或 zip 包。"
                  : "该 Creator 暂无已发布 Skill。"}
              </div>
            ) : (
              <div className="claw-list">
                {creator.skills.map((skill) => (
                  <SkillCard key={skill.slug} skill={skill} variant="row" />
                ))}
              </div>
            )
          ) : null}

          {activeTab === "plugins" ? (
            <div className="empty">Plugins 功能暂未开放，当前平台仅支持 Skill 发布与浏览。</div>
          ) : null}

          {activeTab === "starred" ? (
            <div className="empty">Starred 功能暂未开放，暂不支持查看 Creator 的收藏列表。</div>
          ) : null}
        </section>
      </section>
    </div>
  );
}
