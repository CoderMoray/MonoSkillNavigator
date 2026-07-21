import type { ReviewVerdict } from "./types";

const STORAGE_KEY = "skill-platform-publish-notice";

export interface PublishNotice {
  slug: string;
  name: string;
  version: string;
  verdict: ReviewVerdict;
  isNewVersion: boolean;
}

export function savePublishNotice(notice: PublishNotice): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notice));
}

export function readPublishNotice(): PublishNotice | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PublishNotice;
  } catch {
    return null;
  }
}

export function clearPublishNotice(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(STORAGE_KEY);
}

export function publishNoticeTitle(notice: PublishNotice): string {
  if (notice.verdict === "published") {
    return notice.isNewVersion ? "新版本发布成功" : "Skill 发布成功";
  }
  if (notice.verdict === "needs-review") {
    return notice.isNewVersion ? "新版本已提交，等待审查" : "Skill 已提交，等待审查";
  }
  return notice.isNewVersion ? "新版本发布被拒绝" : "Skill 发布被拒绝";
}

export function publishNoticeDescription(notice: PublishNotice): string {
  const label = `${notice.name} v${notice.version}`;

  if (notice.verdict === "published") {
    return `${label} 已通过审查并发布到平台。`;
  }
  if (notice.verdict === "needs-review") {
    return `${label} 已上传并完成初步审查，需要人工复核后方可公开。`;
  }
  return `${label} 未通过审查，请查看详情页了解原因并修改后重新发布。`;
}
