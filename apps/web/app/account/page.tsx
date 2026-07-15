"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, KeyRound, LogOut, ShieldCheck, UserCircle } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { SkillCard } from "../../components/SkillCard";
import { getCurrentUser, getLeaderboard, logoutUser } from "../../lib/api";
import { clearAuthToken, getAuthToken } from "../../lib/auth-token";
import { aggregateCreators, normalizeHandle } from "../../lib/creators";
import { formatDateTime, formatNumber } from "../../lib/format";
import type { CreatorSummary } from "../../lib/creators";
import type { PublicUser } from "../../lib/types";

export default function AccountPage() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [creator, setCreator] = useState<CreatorSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const token = getAuthToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser(token);
        const skills = await getLeaderboard("downloads", 100);
        const matchedCreator = aggregateCreators(skills).find(
          (item) => item.handle === normalizeHandle(currentUser.username)
        ) ?? null;
        if (!cancelled) {
          setUser(currentUser);
          setCreator(matchedCreator);
        }
      } catch {
        clearAuthToken();
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    const token = getAuthToken();
    clearAuthToken();
    setUser(null);
    if (token) {
      await logoutUser(token).catch(() => undefined);
    }
    window.location.reload();
  }

  return (
    <AppShell title="Profile">
      <div className="market-stack">
        <section className="section-head">
          <div>
            <span className="eyebrow">
              <UserCircle size={14} />
              Profile
            </span>
            <h2 style={{ marginTop: 14 }}>个人资料</h2>
            <p>查看当前账户信息、发布表现和协作 Skill。</p>
          </div>
        </section>

        {loading ? (
          <div className="skeleton" />
        ) : !user ? (
          <section className="card auth-card">
            <h2>尚未登录</h2>
            <p className="description">请先登录或注册一个平台账户。</p>
            <div className="hero-actions">
              <Link className="button primary" href="/login">登录</Link>
              <Link className="button secondary" href="/register">注册</Link>
            </div>
          </section>
        ) : (
          <section className="profile-layout">
            <aside className="profile-card">
              <div className="profile-avatar">{user.username.slice(0, 1).toUpperCase()}</div>
              <div>
                <div className="profile-name-row">
                  <h1>{user.username}</h1>
                  {user.role === "admin" ? <BadgeCheck color="var(--blue)" size={20} /> : null}
                </div>
                <p>@{normalizeHandle(user.username)}</p>
              </div>

              <div className="profile-stat-grid">
                <div>
                  <strong>{creator?.published ?? 0}</strong>
                  <span>published</span>
                </div>
                <div>
                  <strong>{formatNumber(creator?.downloads ?? 0)}</strong>
                  <span>downloads</span>
                </div>
                <div>
                  <strong>{creator?.averageRating ? creator.averageRating.toFixed(1) : "new"}</strong>
                  <span>stars</span>
                </div>
              </div>

              <div className="profile-meta">
                <h2>About</h2>
                <p>{user.role === "admin" ? "Platform administrator." : "Publisher on SkillHub."}</p>
                <h2>Account</h2>
                <div className="tag-row">
                  <span className="badge">ID {user.id.slice(0, 8)}</span>
                  <span className="badge">创建 {formatDateTime(user.createdAt)}</span>
                  <span className="badge">更新 {formatDateTime(user.updatedAt)}</span>
                </div>
              </div>

              <div className="hero-actions">
                <Link className="button secondary" href="/account/change-password">
                  <KeyRound size={15} /> 修改密码
                </Link>
                <button className="button secondary" onClick={handleLogout} type="button">
                  <LogOut size={15} /> 登出
                </button>
              </div>
            </aside>

            <section className="profile-content">
              <div className="section-head">
                <div>
                  <h2>Published & contributed skills</h2>
                  <p>与你的用户名匹配的发布和协作记录。</p>
                </div>
                <ShieldCheck color="var(--green)" />
              </div>
              {creator?.skills.length ? (
                <div className="claw-list" style={{ marginTop: 18 }}>
                  {creator.skills.map((skill) => (
                    <SkillCard key={skill.name} skill={skill} variant="row" />
                  ))}
                </div>
              ) : (
                <div className="empty" style={{ marginTop: 18 }}>
                  暂无发布记录。登录后可通过 CLI publish 文件夹或 zip 包。
                </div>
              )}
            </section>
          </section>
        )}
      </div>
    </AppShell>
  );
}
