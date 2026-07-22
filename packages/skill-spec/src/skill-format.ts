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
