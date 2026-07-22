import { z } from "zod";

export const SKILL_ENTRY_BASENAMES = ["SKILL.md", "skill.md", "skills.md"] as const;

export type SkillEntryBasename = (typeof SKILL_ENTRY_BASENAMES)[number];

const UNSCOPED_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SCOPED_SLUG_PATTERN = /^@[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SKILL_IDENTIFIER_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function isSkillEntryBasename(name: string): boolean {
  const lower = name.toLowerCase();
  return SKILL_ENTRY_BASENAMES.some((candidate) => candidate.toLowerCase() === lower);
}

export function isSkillEntryPath(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? filePath;
  return isSkillEntryBasename(base);
}

export function findSkillEntryPath(paths: string[]): string | undefined {
  for (const preferred of SKILL_ENTRY_BASENAMES) {
    const match = paths.find((filePath) => {
      const base = filePath.split("/").pop() ?? filePath;
      return base === preferred;
    });
    if (match) {
      return match;
    }
  }

  return paths.find((filePath) => isSkillEntryPath(filePath));
}

export function findSkillEntryFile<T extends { path: string }>(files: T[]): T | undefined {
  const paths = files.map((file) => file.path);
  const entryPath = findSkillEntryPath(paths);
  return entryPath ? files.find((file) => file.path === entryPath) : undefined;
}

export function isValidSkillSlug(value: string): boolean {
  if (!value || value.length > 128) {
    return false;
  }

  if (value.includes("/")) {
    return SCOPED_SLUG_PATTERN.test(value);
  }

  return value.length <= 64 && UNSCOPED_SLUG_PATTERN.test(value);
}

export function isValidSkillIdentifierName(value: string): boolean {
  return value.length >= 1 && value.length <= 64 && SKILL_IDENTIFIER_PATTERN.test(value);
}

export const skillSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine(isValidSkillSlug, "Slug must be npm-safe lowercase, for example demo-plugin or @scope/demo-plugin");

export const skillIdentifierNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    SKILL_IDENTIFIER_PATTERN,
    "Portable skill name must use 1-64 lowercase letters, numbers, or hyphens"
  );

export const semverSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    "Version must be valid SemVer, for example 1.0.0"
  );

export const releaseTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "Release tags must use lowercase letters, numbers, dots, underscores, or hyphens");

export interface SkillValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export function formatZodIssuePath(path: (string | number)[]): string {
  return path.map(String).join(".");
}

export function formatPublishMetadataError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return "发布信息格式无效。";
  }

  const field = formatZodIssuePath(issue.path.map(String));
  switch (field) {
    case "displayName":
      return "请填写 Display Name。";
    case "slug":
      return "Slug 必须是 npm-safe 小写标识，例如 demo-plugin 或 @scope/demo-plugin。";
    case "summary":
      return "Summary 至少需要 1 个字符。";
    case "categories":
      return "请至少选择一个 Category。";
    case "version":
      return "Version 必须采用 SemVer 格式，例如 1.0.0。";
    case "releaseTags":
      return "请至少填写一个 Release Tag。";
    default:
      return issue.message;
  }
}

export const skillPublishMetadataSchema = z.object({
  displayName: z.string().trim().min(1).max(128),
  slug: skillSlugSchema,
  summary: z.string().trim().min(1).max(1024),
  categories: z.array(z.string().trim().min(1).max(64)).min(1).max(10),
  topics: z.array(z.string().trim().min(1).max(64)).max(20).optional().default([]),
  version: semverSchema,
  releaseTags: z.array(releaseTagSchema).min(1).max(10)
});

export type SkillPublishMetadata = z.infer<typeof skillPublishMetadataSchema>;

export function validatePublishMetadataInput(input: SkillPublishMetadata): string | undefined {
  const result = skillPublishMetadataSchema.safeParse(input);
  if (!result.success) {
    return formatPublishMetadataError(result.error);
  }
  return undefined;
}

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---/;

export interface SkillFrontmatterHints {
  name?: string;
  description?: string;
  slug?: string;
  version?: string;
  categories?: string[];
  topics?: string[];
}

export function parseSkillFrontmatterHints(markdown: string): SkillFrontmatterHints | null {
  const match = frontmatterPattern.exec(markdown);
  if (!match?.[1]) {
    return null;
  }

  const record = parseSimpleFrontmatter(match[1]);
  const hints: SkillFrontmatterHints = {};

  if (typeof record.name === "string" && record.name.trim()) {
    hints.name = record.name.trim();
  }
  if (typeof record.description === "string" && record.description.trim()) {
    hints.description = record.description.trim();
  }
  if (typeof record.slug === "string" && record.slug.trim()) {
    hints.slug = record.slug.trim();
  }
  if (typeof record.version === "string" && record.version.trim()) {
    hints.version = record.version.trim();
  }
  if (Array.isArray(record.categories)) {
    hints.categories = record.categories
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }
  if (Array.isArray(record.topics)) {
    hints.topics = record.topics
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }

  return hints;
}

function parseSimpleFrontmatter(yamlText: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const lines = yamlText.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim() || /^\s*#/.test(line)) {
      index += 1;
      continue;
    }

    const keyMatch = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!keyMatch?.[1]) {
      index += 1;
      continue;
    }

    const key = keyMatch[1];
    const rawValue = keyMatch[2]?.trim() ?? "";

    if (rawValue === "" && index + 1 < lines.length && /^\s+-\s/.test(lines[index + 1] ?? "")) {
      index += 1;
      const items: string[] = [];
      while (index < lines.length && /^\s+-\s/.test(lines[index] ?? "")) {
        items.push(unquoteYamlScalar((lines[index] ?? "").replace(/^\s+-\s+/, "").trim()));
        index += 1;
      }
      result[key] = items;
      continue;
    }

    if (rawValue === "|" || rawValue === ">") {
      index += 1;
      const block: string[] = [];
      while (index < lines.length && /^\s+\S/.test(lines[index] ?? "")) {
        block.push((lines[index] ?? "").replace(/^\s+/, ""));
        index += 1;
      }
      result[key] = block.join("\n").trim();
      continue;
    }

    result[key] = unquoteYamlScalar(rawValue);
    index += 1;
  }

  return result;
}

function unquoteYamlScalar(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function resolveZipRootPrefix(paths: string[]): string {
  if (findSkillEntryPath(paths.filter((item) => !item.includes("/")))) {
    return "";
  }

  const firstSegments = new Set(paths.map((item) => item.split("/")[0]).filter(Boolean));
  if (firstSegments.size !== 1) {
    return "";
  }

  const [prefix] = [...firstSegments];
  if (!prefix) {
    return "";
  }

  const prefixedPaths = paths.filter((item) => item.startsWith(`${prefix}/`));
  return findSkillEntryPath(prefixedPaths.map((item) => item.slice(prefix.length + 1))) ? `${prefix}/` : "";
}

export function resolveZipSkillEntryPath(paths: string[]): string | undefined {
  const normalized = paths.map((item) => item.replace(/\\/g, "/").replace(/^\/+/, ""));
  const prefix = resolveZipRootPrefix(normalized);
  const relativePaths = normalized.map((item) =>
    prefix && item.startsWith(prefix) ? item.slice(prefix.length) : item
  );
  const entryRelative = findSkillEntryPath(relativePaths);
  if (!entryRelative) {
    return undefined;
  }

  return normalized.find((item) => {
    const relative = prefix && item.startsWith(prefix) ? item.slice(prefix.length) : item;
    return relative === entryRelative;
  });
}
