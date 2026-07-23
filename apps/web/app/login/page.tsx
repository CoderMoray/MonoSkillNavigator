"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LogIn } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { loginUser } from "../../lib/api";
import { setAuthToken } from "../../lib/auth-token";
import { creatorProfilePath } from "../../lib/creators";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const session = await loginUser(username, password);
      setAuthToken(session.token);
      router.push(creatorProfilePath(session.user.username));
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="登录">
      <div className="auth-page">
        <section className="auth-card card">
          <span className="eyebrow">
            <LogIn size={14} />
            Sign in
          </span>
          <h1>登录 Skill 管理平台</h1>
          <p className="description">登录后可以进入用户中心，并使用后续需要身份态的协作能力。</p>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>用户名</span>
              <input autoComplete="username" onChange={(event) => setUsername(event.target.value)} required value={username} />
            </label>
            <label className="field">
              <span>密码</span>
              <input
                autoComplete="current-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {error ? <div className="error compact-error">{error}</div> : null}
            <button className="button primary" disabled={submitting} type="submit">
              {submitting ? "登录中..." : "登录"}
            </button>
          </form>

          <p className="description">
            还没有账户？<Link className="text-link" href="/register">注册新用户</Link>
          </p>
        </section>
      </div>
    </AppShell>
  );
}
