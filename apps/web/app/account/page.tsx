"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserCircle } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { getCurrentUser } from "../../lib/api";
import { clearAuthToken, getAuthToken } from "../../lib/auth-token";
import { normalizeHandle } from "../../lib/creators";

export default function AccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function redirectToProfile() {
      const token = getAuthToken();
      if (!token) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      try {
        const user = await getCurrentUser(token);
        if (!cancelled) {
          router.replace(`/creators/${encodeURIComponent(normalizeHandle(user.username))}`);
        }
      } catch {
        clearAuthToken();
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void redirectToProfile();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <AppShell title="Profile">
        <div className="skeleton" />
      </AppShell>
    );
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
            <p>登录后查看你的 Creator 主页、发布记录与账户设置。</p>
          </div>
        </section>

        <section className="card auth-card">
          <h2>尚未登录</h2>
          <p className="description">请先登录或注册一个平台账户。</p>
          <div className="hero-actions">
            <Link className="button primary" href="/login">登录</Link>
            <Link className="button secondary" href="/register">注册</Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
