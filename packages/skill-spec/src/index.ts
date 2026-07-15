import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import yaml from "js-yaml";
import { z } from "zod";

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export const skillSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/);

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

export const skillManifestSchema = z
  .object({
    slug: skillSlugSchema.optional(),
    name: z.string().trim().min(1).max(128),
    description: z.string().min(20).max(1024),
    version: z.string().optional(),
    categories: z.array(z.string().trim().min(1).max(64)).optional(),
    topics: z.array(z.string().trim().min(1).max(64)).optional(),
    "release-tags": z.array(releaseTagSchema).optional(),
    author: z.string().optional(),
    license: z.string().optional(),
    tags: z.array(z.string()).optional(),
    supportedAgents: z.array(z.string()).optional(),
    "allowed-tools": z.union([z.array(z.string()), z.string()]).optional(),
    "disallowed-tools": z.union([z.array(z.string()), z.string()]).optional()
  })
  .passthrough();

export type SkillManifest = z.infer<typeof skillManifestSchema>;

export const skillPublishMetadataSchema = z.object({
  displayName: z.string().trim().min(1).max(128),
  slug: skillSlugSchema,
  summary: z.string().trim().min(20).max(1024),
  categories: z.array(z.string().trim().min(1).max(64)).min(1).max(10),
  topics: z.array(z.string().trim().min(1).max(64)).max(20).optional().default([]),
  version: semverSchema,
  releaseTags: z.array(releaseTagSchema).min(1).max(10)
});

export type SkillPublishMetadata = z.infer<typeof skillPublishMetadataSchema>;

export interface SkillFile {
  path: string;
  content: string;
  size: number;
  sha256: string;
}

export interface SkillSnapshot {
  manifest: SkillManifest;
  readme: string;
  files: SkillFile[];
  contentHash: string;
  createdAt: string;
}

export interface SkillValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface ParsedSkillMarkdown {
  manifest: SkillManifest;
  body: string;
  rawFrontmatter: Record<string, unknown>;
}

export function parseSkillMarkdown(markdown: string): ParsedSkillMarkdown {
  const match = frontmatterPattern.exec(markdown);
  if (!match) {
    throw new Error("SKILL.md must start with YAML frontmatter delimited by ---");
  }

  const rawFrontmatter = yaml.load(match[1] ?? "") as Record<string, unknown>;
  const parsed = skillManifestSchema.parse(rawFrontmatter ?? {});

  return {
    manifest: {
      ...parsed,
      slug: getSkillSlug(parsed)
    },
    body: match[2] ?? "",
    rawFrontmatter: rawFrontmatter ?? {}
  };
}

export function getSkillSlug(manifest: Pick<SkillManifest, "name" | "slug">): string {
  const explicitSlug = skillSlugSchema.safeParse(manifest.slug);
  if (explicitSlug.success) {
    return explicitSlug.data;
  }

  if (manifest.slug === undefined) {
    const legacyName = skillSlugSchema.safeParse(manifest.name);
    if (legacyName.success) {
      return legacyName.data;
    }
    throw new Error("slug is required when the display name is not a legacy kebab-case identifier");
  }

  throw new Error("slug must contain 1-64 lowercase letters, numbers, or hyphens");
}

export function applySkillPublishMetadata(
  snapshot: SkillSnapshot,
  input: SkillPublishMetadata
): SkillSnapshot {
  const metadata = normalizePublishMetadata(input);
  const skillMd = snapshot.files.find((file) => file.path === "SKILL.md");
  if (!skillMd) {
    throw new Error("Skill package must include SKILL.md");
  }

  const parsed = parseSkillMarkdown(skillMd.content);
  const frontmatter = {
    ...parsed.rawFrontmatter,
    slug: metadata.slug,
    name: metadata.displayName,
    description: metadata.summary,
    version: metadata.version,
    categories: metadata.categories,
    topics: metadata.topics,
    "release-tags": metadata.releaseTags
  };
  const manifest = skillManifestSchema.parse(frontmatter);
  const content = `---\n${yaml.dump(frontmatter, { lineWidth: -1, noRefs: true })}---\n${parsed.body}`;
  const files = snapshot.files.map((file) =>
    file.path === "SKILL.md"
      ? {
          ...file,
          content,
          size: Buffer.byteLength(content, "utf8"),
          sha256: sha256(content)
        }
      : file
  );

  return {
    manifest: {
      ...manifest,
      slug: getSkillSlug(manifest)
    },
    readme: parsed.body,
    files,
    contentHash: hashSnapshotFiles(files),
    createdAt: snapshot.createdAt
  };
}

export async function readSkillDirectory(rootDir: string): Promise<SkillSnapshot> {
  const absoluteRoot = path.resolve(rootDir);
  const skillMdPath = path.join(absoluteRoot, "SKILL.md");
  const skillMarkdown = await readFile(skillMdPath, "utf8");
  const parsed = parseSkillMarkdown(skillMarkdown);
  const files = await readTextFiles(absoluteRoot);
  const contentHash = hashSnapshotFiles(files);

  return {
    manifest: parsed.manifest,
    readme: parsed.body,
    files,
    contentHash,
    createdAt: new Date().toISOString()
  };
}

export async function readSkillPackage(inputPath: string): Promise<SkillSnapshot> {
  const absolutePath = path.resolve(inputPath);
  const stats = await stat(absolutePath);

  if (stats.isDirectory()) {
    return readSkillDirectory(absolutePath);
  }

  if (stats.isFile() && absolutePath.toLowerCase().endsWith(".zip")) {
    return readSkillZip(absolutePath);
  }

  throw new Error("Skill package must be a directory or .zip file");
}

export async function readSkillZip(zipPath: string): Promise<SkillSnapshot> {
  return readSkillZipBuffer(await readFile(zipPath));
}

export async function readSkillPackageZipBuffer(inputPath: string): Promise<Buffer> {
  const absolutePath = path.resolve(inputPath);
  const stats = await stat(absolutePath);

  if (stats.isFile() && absolutePath.toLowerCase().endsWith(".zip")) {
    return readFile(absolutePath);
  }

  const snapshot = await readSkillPackage(absolutePath);
  return skillSnapshotToZipBuffer(snapshot);
}

export async function writeSkillZip(snapshot: SkillSnapshot, outputPath: string): Promise<void> {
  const absoluteOutput = path.resolve(outputPath);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  const zip = createZipFromSnapshot(snapshot);
  zip.writeZip(absoluteOutput);
}

export function readSkillZipBuffer(buffer: Buffer): SkillSnapshot {
  const zip = new AdmZip(buffer);
  const files = readZipTextFiles(zip);
  const skillMd = files.find((file) => file.path === "SKILL.md");
  if (!skillMd) {
    throw new Error("Skill zip must include SKILL.md at the root, or inside a single top-level folder");
  }

  const parsed = parseSkillMarkdown(skillMd.content);
  return {
    manifest: parsed.manifest,
    readme: parsed.body,
    files,
    contentHash: hashSnapshotFiles(files),
    createdAt: new Date().toISOString()
  };
}

export function skillSnapshotToZipBuffer(snapshot: SkillSnapshot): Buffer {
  return createZipFromSnapshot(snapshot).toBuffer();
}

export function validateSkillSnapshot(snapshot: SkillSnapshot): SkillValidationIssue[] {
  const issues: SkillValidationIssue[] = [];
  const skillMd = snapshot.files.find((file) => file.path === "SKILL.md");

  if (!skillMd) {
    issues.push({
      code: "missing-skill-md",
      message: "Skill package must include SKILL.md",
      path: "SKILL.md"
    });
  }

  const parsed = skillManifestSchema.safeParse(snapshot.manifest);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        code: "invalid-frontmatter",
        message: issue.message,
        path: issue.path.join(".")
      });
    }
  } else {
    try {
      getSkillSlug(parsed.data);
    } catch (error) {
      issues.push({
        code: "invalid-frontmatter",
        message: error instanceof Error ? error.message : "Invalid slug",
        path: "slug"
      });
    }
  }

  for (const file of snapshot.files) {
    if (file.path.includes("..") || path.isAbsolute(file.path)) {
      issues.push({
        code: "unsafe-path",
        message: "Skill file path must stay inside the skill directory",
        path: file.path
      });
    }
  }

  return issues;
}

export async function writeSkillSnapshot(snapshot: SkillSnapshot, targetDir: string): Promise<void> {
  const absoluteTarget = path.resolve(targetDir);
  await mkdir(absoluteTarget, { recursive: true });

  for (const file of snapshot.files) {
    if (file.path.includes("..") || path.isAbsolute(file.path)) {
      throw new Error(`Refusing to write unsafe file path: ${file.path}`);
    }

    const outputPath = path.join(absoluteTarget, file.path);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, file.content, "utf8");
  }
}

export function normalizeTools(value: SkillManifest["allowed-tools"]): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return value
    .split(/[,\s]+/)
    .map((tool) => tool.trim())
    .filter(Boolean);
}

function normalizePublishMetadata(input: SkillPublishMetadata): SkillPublishMetadata {
  const metadata = skillPublishMetadataSchema.parse(input);
  return {
    ...metadata,
    categories: uniqueStrings(metadata.categories),
    topics: uniqueStrings(metadata.topics),
    releaseTags: uniqueStrings(metadata.releaseTags)
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function readTextFiles(rootDir: string, currentDir = rootDir): Promise<SkillFile[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: SkillFile[] = [];

  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);
    const stats = await stat(absolutePath);
    const relativePath = toPosixPath(path.relative(rootDir, absolutePath));

    if (entry.isDirectory()) {
      files.push(...(await readTextFiles(rootDir, absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (stats.size > 1024 * 1024) {
      throw new Error(`File is too large for Phase 1 review: ${relativePath}`);
    }

    const content = await readFile(absolutePath, "utf8");
    files.push({
      path: relativePath,
      content,
      size: stats.size,
      sha256: sha256(content)
    });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function shouldSkipEntry(name: string): boolean {
  return [".git", "node_modules", ".data", "dist"].includes(name);
}

function readZipTextFiles(zip: AdmZip): SkillFile[] {
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      entry,
      path: normalizeZipEntryPath(entry.entryName)
    }))
    .filter((item) => item.path && !shouldSkipZipPath(item.path));

  const prefix = resolveZipRootPrefix(entries.map((item) => item.path));
  const files: SkillFile[] = [];

  for (const item of entries) {
    const relativePath = stripZipPrefix(item.path, prefix);
    if (!relativePath || shouldSkipZipPath(relativePath)) {
      continue;
    }

    const content = item.entry.getData().toString("utf8");
    files.push({
      path: relativePath,
      content,
      size: Buffer.byteLength(content, "utf8"),
      sha256: sha256(content)
    });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function createZipFromSnapshot(snapshot: SkillSnapshot): AdmZip {
  const zip = new AdmZip();
  for (const file of snapshot.files) {
    if (file.path.includes("..") || path.isAbsolute(file.path)) {
      throw new Error(`Refusing to zip unsafe file path: ${file.path}`);
    }
    zip.addFile(file.path, Buffer.from(file.content, "utf8"));
  }
  return zip;
}

function normalizeZipEntryPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function shouldSkipZipPath(value: string): boolean {
  if (value.includes("..") || path.isAbsolute(value)) {
    throw new Error(`Unsafe zip entry path: ${value}`);
  }

  return value.split("/").some((segment) => shouldSkipEntry(segment));
}

function resolveZipRootPrefix(paths: string[]): string {
  if (paths.includes("SKILL.md")) {
    return "";
  }

  const firstSegments = new Set(paths.map((item) => item.split("/")[0]).filter(Boolean));
  if (firstSegments.size !== 1) {
    return "";
  }

  const [prefix] = [...firstSegments];
  return paths.includes(`${prefix}/SKILL.md`) ? `${prefix}/` : "";
}

function stripZipPrefix(value: string, prefix: string): string {
  return prefix && value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function hashSnapshotFiles(files: SkillFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.sha256);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
