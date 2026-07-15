"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { UserPlus } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { registerUser } from "../../lib/api";
import { setAuthToken } from "../../lib/auth-token";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setSubmitting(true);
    try {
      const session = await registerUser(username, password);
      setAuthToken(session.token);
      router.push("/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="注册">
      <div className="auth-page">
        <section className="auth-card card">
          <span className="eyebrow">
            <UserPlus size={14} />
            Create account
          </span>
          <h1>注册平台用户</h1>
          <p className="description">首个注册用户会自动成为管理员；后续用户默认为普通用户。</p>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>用户名</span>
              <input
                autoComplete="username"
                minLength={3}
                onChange={(event) => setUsername(event.target.value)}
                pattern="[a-zA-Z0-9_.-]+"
                required
                value={username}
              />
            </label>
            <label className="field">
              <span>密码</span>
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <label className="field">
              <span>确认密码</span>
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </label>
            {error ? <div className="error compact-error">{error}</div> : null}
            <button className="button primary" disabled={submitting} type="submit">
              {submitting ? "注册中..." : "注册并登录"}
            </button>
          </form>

          <p className="description">
            已有账户？<Link className="text-link" href="/login">去登录</Link>
          </p>
        </section>
      </div>
    </AppShell>
  );
}
