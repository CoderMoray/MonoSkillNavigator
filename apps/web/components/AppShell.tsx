"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BarChart3, Boxes, LayoutDashboard, ShieldCheck, Sparkles, UserCircle } from "lucide-react";
import { AuthStatus } from "./AuthStatus";

const navItems = [
  { href: "/", label: "首页", icon: LayoutDashboard },
  { href: "/skills", label: "Skills", icon: Boxes },
  { href: "/creators", label: "Creators", icon: UserCircle },
  { href: "/leaderboard", label: "榜单", icon: BarChart3 },
  { href: "/reviews", label: "Audits", icon: ShieldCheck }
];

export function AppShell({ children, title = "概览" }: { children: ReactNode; title?: string }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <span className="brand-title">SkillHub</span>
        </Link>

        <nav aria-label="主导航" className="top-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link className={`top-nav-link ${active ? "active" : ""}`} href={item.href} key={item.href}>
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="topbar-actions">
          <span className="page-title">{title}</span>
          <AuthStatus />
        </div>
      </header>

      <main className="main">{children}</main>
    </div>
  );
}
