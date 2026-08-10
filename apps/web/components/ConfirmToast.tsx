"use client";

import { FileQuestion } from "lucide-react";

interface ConfirmToastProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmToast({
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  confirming = false,
  onConfirm,
  onCancel
}: ConfirmToastProps) {
  return (
    <div
      className="confirm-toast-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !confirming) {
          onCancel();
        }
      }}
      role="presentation"
    >
      <div
        aria-labelledby="confirm-toast-title"
        aria-modal="true"
        className="confirm-toast"
        role="alertdialog"
      >
        <div className="confirm-toast-icon">
          <FileQuestion size={20} />
        </div>
        <div className="confirm-toast-body">
          <strong id="confirm-toast-title">{title}</strong>
          <p>{message}</p>
        </div>
        <div className="confirm-toast-actions">
          <button className="button secondary compact" disabled={confirming} onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button className="button compact" disabled={confirming} onClick={onConfirm} type="button">
            {confirming ? "导出中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
