"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { ErrorToast } from "../../components/ErrorToast";
import { forgotPassword } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorToast(null);

    try {
      // API 始终返回 ok:true（无论账号是否存在），避免枚举
      await forgotPassword(identifier);
      setDone(true);
    } catch (err) {
      setErrorToast(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="忘记密码">
      {errorToast ? <ErrorToast message={errorToast} onClose={() => setErrorToast(null)} /> : null}
      <div className="auth-page">
        <section className="auth-card card">
          <span className="eyebrow">
            <KeyRound size={14} />
            Password reset
          </span>
          <h1>重置密码</h1>

          {done ? (
            <>
              <p className="description">
                如果该用户名或邮箱存在，重置链接已发送至对应邮箱。请查收邮件，按链接重置密码。
              </p>
              <p className="description">
                <Link className="text-link" href="/login">
                  返回登录
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="description">输入注册时的用户名或邮箱，我们将发送密码重置链接。</p>
              <form className="form-grid" onSubmit={handleSubmit}>
                <label className="field">
                  <span>用户名或邮箱</span>
                  <input
                    autoComplete="username"
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="用户名或邮箱"
                    required
                    value={identifier}
                  />
                </label>
                <button className="button primary" disabled={submitting} type="submit">
                  {submitting ? "发送中..." : "发送重置链接"}
                </button>
              </form>
              <p className="description">
                想起来了？<Link className="text-link" href="/login">返回登录</Link>
              </p>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
