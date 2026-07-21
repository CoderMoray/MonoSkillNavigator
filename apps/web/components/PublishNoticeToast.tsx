"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertCircle, CheckCircle2, X, XCircle } from "lucide-react";
import type { PublishNotice } from "../lib/publish-notice";
import { publishNoticeDescription, publishNoticeTitle } from "../lib/publish-notice";

const AUTO_DISMISS_MS = 5000;

interface PublishNoticeToastProps {
  notice: PublishNotice;
  onClose: () => void;
}

export function PublishNoticeToast({ notice, onClose }: PublishNoticeToastProps) {
  const Icon =
    notice.verdict === "published" ? CheckCircle2 : notice.verdict === "needs-review" ? AlertCircle : XCircle;

  useEffect(() => {
    const timer = window.setTimeout(onClose, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`publish-notice-toast ${notice.verdict}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="publish-notice-toast-icon">
        <Icon size={18} />
      </div>
      <div className="publish-notice-toast-body">
        <strong>{publishNoticeTitle(notice)}</strong>
        <p>{publishNoticeDescription(notice)}</p>
        <Link
          className="publish-notice-toast-link"
          href={`/skills/${encodeURIComponent(notice.slug)}`}
          onClick={onClose}
        >
          查看 Skill 详情
        </Link>
      </div>
      <button aria-label="关闭" className="publish-notice-toast-close" onClick={onClose} type="button">
        <X size={14} />
      </button>
    </div>
  );
}
