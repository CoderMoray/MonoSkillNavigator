import type {
  FunctionalEvaluationReport,
  PublicUser,
  RegistryContributor,
  RegistryIssue,
  RegistryRating,
  RegistrySkill,
  ReviewReport,
  SkillSearchResult
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

export async function getSkills(query = ""): Promise<SkillSearchResult[]> {
  const url = new URL("/skills", API_BASE_URL);
  if (query.trim()) {
    url.searchParams.set("query", query.trim());
  }

  const data = await request<{ items: SkillSearchResult[] }>(url);
  return data.items;
}

export async function getLeaderboard(sort = "functional", limit = 8): Promise<SkillSearchResult[]> {
  const url = new URL("/leaderboard", API_BASE_URL);
  url.searchParams.set("sort", sort);
  url.searchParams.set("limit", String(limit));

  const data = await request<{ items: SkillSearchResult[] }>(url);
  return data.items;
}

export async function getSkill(slug: string): Promise<RegistrySkill> {
  return request<RegistrySkill>(new URL(`/skills/${encodeURIComponent(slug)}`, API_BASE_URL));
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function registerUser(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>(new URL("/auth/register", API_BASE_URL), {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export async function loginUser(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>(new URL("/auth/login", API_BASE_URL), {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export async function logoutUser(token: string): Promise<void> {
  await request<{ ok: boolean }>(new URL("/auth/logout", API_BASE_URL), {
    method: "POST",
    token
  });
}

export async function getCurrentUser(token: string): Promise<PublicUser> {
  const data = await request<{ user: PublicUser }>(new URL("/auth/me", API_BASE_URL), { token });
  return data.user;
}

export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<PublicUser> {
  const data = await request<{ user: PublicUser }>(new URL("/auth/change-password", API_BASE_URL), {
    method: "POST",
    token,
    body: JSON.stringify({ currentPassword, newPassword })
  });
  return data.user;
}

export interface PublishSkillFrontmatter {
  name?: string;
  description?: string;
  slug?: string;
  version?: string;
  categories?: string[];
  topics?: string[];
}

export interface PublishPreviewResponse {
  entryPath: string;
  frontmatter: PublishSkillFrontmatter;
}

export async function previewSkillArchive(
  token: string,
  archiveBase64: string
): Promise<PublishPreviewResponse> {
  return request<PublishPreviewResponse>(new URL("/skills/publish/preview", API_BASE_URL), {
    method: "POST",
    token,
    body: JSON.stringify({ archiveBase64 })
  });
}

export async function publishSkillArchive(
  token: string,
  archiveBase64: string,
  metadata: PublishSkillMetadata,
  changelog?: string
): Promise<PublishSkillResponse> {
  return request<PublishSkillResponse>(new URL("/skills/publish", API_BASE_URL), {
    method: "POST",
    token,
    body: JSON.stringify({
      archiveBase64,
      metadata,
      ...(changelog?.trim() ? { changelog: changelog.trim() } : {})
    })
  });
}

export async function addSkillContributor(
  token: string,
  skillSlug: string,
  name: string,
  role: RegistryContributor["role"]
): Promise<RegistryContributor> {
  const data = await request<{ contributor: RegistryContributor }>(
    new URL(`/skills/${encodeURIComponent(skillSlug)}/contributors`, API_BASE_URL),
    {
      method: "POST",
      token,
      body: JSON.stringify({ name, role })
    }
  );
  return data.contributor;
}

export async function createSkillIssue(
  token: string,
  skillSlug: string,
  input: {
    type: RegistryIssue["type"];
    severity?: RegistryIssue["severity"];
    title: string;
    body?: string;
  }
): Promise<RegistryIssue> {
  const data = await request<{ issue: RegistryIssue }>(
    new URL(`/skills/${encodeURIComponent(skillSlug)}/issues`, API_BASE_URL),
    {
      method: "POST",
      token,
      body: JSON.stringify(input)
    }
  );
  return data.issue;
}

export async function addSkillRating(
  token: string,
  skillSlug: string,
  input: {
    score: number;
    version?: string;
    comment?: string;
  }
): Promise<{ rating: RegistryRating; averageRating: number; ratingCount: number }> {
  return request<{ rating: RegistryRating; averageRating: number; ratingCount: number }>(
    new URL(`/skills/${encodeURIComponent(skillSlug)}/ratings`, API_BASE_URL),
    {
      method: "POST",
      token,
      body: JSON.stringify(input)
    }
  );
}

interface AuthResponse {
  user: PublicUser;
  token: string;
  expiresAt: string;
}

export interface PublishSkillResponse {
  slug: string;
  name: string;
  version: string;
  releaseTags: string[];
  status: string;
  contentHash: string;
  review: ReviewReport;
  evaluation?: FunctionalEvaluationReport;
  changelog?: string;
}

export interface PublishSkillMetadata {
  displayName: string;
  slug: string;
  summary: string;
  categories: string[];
  topics: string[];
  version: string;
  releaseTags: string[];
}

interface RequestOptions {
  method?: string;
  body?: BodyInit;
  token?: string;
}

async function request<T>(url: URL, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json"
  };
  if (options.body) {
    headers["content-type"] = "application/json";
  }
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      ...headers
    },
    body: options.body,
    cache: "no-store"
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(data?.error ?? `API request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}
