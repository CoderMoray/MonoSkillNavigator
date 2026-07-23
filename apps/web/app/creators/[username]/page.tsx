"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../../../components/AppShell";
import { CreatorProfileView } from "../../../components/CreatorProfileView";
import { PublishNoticeToast } from "../../../components/PublishNoticeToast";
import { getCreatorProfile, getCurrentUser } from "../../../lib/api";
import { clearPublishNotice, readPublishNotice, type PublishNotice } from "../../../lib/publish-notice";
import { getAuthToken } from "../../../lib/auth-token";
import { normalizeHandle, type CreatorSummary } from "../../../lib/creators";
import type { PublicUser } from "../../../lib/types";

export default function CreatorProfilePage() {
  const params = useParams<{ username: string }>();
  const handle = normalizeHandle(decodeURIComponent(params.username));
  const [creator, setCreator] = useState<CreatorSummary | null>(null);
  const [viewer, setViewer] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState<PublishNotice | null>(null);

  useEffect(() => {
    setPublishNotice(readPublishNotice());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = getAuthToken();
        const [matched, currentUser] = await Promise.all([
          getCreatorProfile(handle),
          token ? getCurrentUser(token).catch(() => null) : Promise.resolve(null)
        ]);
        if (!cancelled) {
          setCreator(matched);
          setViewer(currentUser);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
          setCreator(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const isOwner = Boolean(viewer && normalizeHandle(viewer.username) === handle);

  if (loading) {
    return (
      <AppShell title={`@${handle}`}>
        <div className="skeleton" />
      </AppShell>
    );
  }

  if (error || !creator) {
    return (
      <AppShell title={`@${handle}`}>
        <div className="page-stack">
          <Link className="button secondary" href="/creators" style={{ width: "fit-content" }}>
            返回 Creators
          </Link>
          <div className="error">{error ?? "Creator 不存在"}</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={`@${creator.handle}`}>
      {isOwner && publishNotice ? (
        <PublishNoticeToast
          notice={publishNotice}
          onClose={() => {
            clearPublishNotice();
            setPublishNotice(null);
          }}
        />
      ) : null}
      <CreatorProfileView creator={creator} viewer={viewer} />
    </AppShell>
  );
}
