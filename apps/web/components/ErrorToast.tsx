"use client";

import { X, XCircle } from "lucide-react";
import { useEffect } from "react";

const AUTO_DISMISS_MS = 5000;

interface ErrorToastProps {
  message: string;
  onClose: () => void;
}

export function ErrorToast({ message, onClose }: ErrorToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  return (
    <div className="publish-notice-toast rejected error-toast" role="alert" aria-live="assertive" aria-atomic="true">
      <div className="publish-notice-toast-icon">
        <XCircle size={18} />
      </div>
      <div className="publish-notice-toast-body">
        <strong>{message}</strong>
      </div>
      <button aria-label="关闭" className="publish-notice-toast-close" onClick={onClose} type="button">
        <X size={14} />
      </button>
    </div>
  );
}
