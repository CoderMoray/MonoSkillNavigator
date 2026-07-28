import { zipSync } from "fflate";
import { resolveZipSkillEntryPath, SKILL_ENTRY_BASENAMES } from "@skill-platform/skill-spec/skill-format";

const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

export interface BrowserRelativeFile {
  relativePath: string;
  file: File;
}

export async function buildSkillZipFileFromBrowserFiles(files: BrowserRelativeFile[]): Promise<File> {
  if (files.length === 0) {
    throw new Error("未选择任何文件。");
  }

  const normalized = files.map(({ relativePath, file }) => ({
    relativePath: normalizeRelativePath(relativePath),
    file
  }));

  const paths = normalized.map((item) => item.relativePath);
  if (!resolveZipSkillEntryPath(paths)) {
    throw new Error(
      `文件夹或压缩包须包含 ${SKILL_ENTRY_BASENAMES.join("、")}（可在根目录或单一顶层目录下）。`
    );
  }

  let totalBytes = 0;
  const zipEntries: Record<string, Uint8Array> = {};
  for (const { relativePath, file } of normalized) {
    if (relativePath.endsWith("/")) {
      continue;
    }
    totalBytes += file.size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("Skill 包总大小不能超过 32 MB。");
    }
    const buffer = new Uint8Array(await file.arrayBuffer());
    zipEntries[relativePath] = buffer;
  }

  const zipped = zipSync(zipEntries, { level: 6 });
  const rootName = inferArchiveBaseName(normalized[0]?.relativePath ?? "skill");
  return new File([zipped], `${rootName}.zip`, { type: "application/zip" });
}

export function relativeFilesFromFileList(fileList: FileList): BrowserRelativeFile[] {
  return [...fileList].map((file) => ({
    relativePath: normalizeRelativePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name),
    file
  }));
}

export async function relativeFilesFromDataTransferItems(items: DataTransferItemList): Promise<BrowserRelativeFile[]> {
  const entries = [...items]
    .map((item) => (item.kind === "file" ? item.webkitGetAsEntry?.() ?? null : null))
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (entries.length === 0) {
    return [];
  }

  const collected: BrowserRelativeFile[] = [];
  for (const entry of entries) {
    await collectEntryFiles(entry, "", collected);
  }
  return collected;
}

async function collectEntryFiles(
  entry: FileSystemEntry,
  parentPath: string,
  output: BrowserRelativeFile[]
): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await readFileEntry(fileEntry);
    const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    output.push({ relativePath: normalizeRelativePath(relativePath), file });
    return;
  }

  if (!entry.isDirectory) {
    return;
  }

  const directory = entry as FileSystemDirectoryEntry;
  const nextParent = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  const children = await readDirectoryEntries(directory);
  for (const child of children) {
    await collectEntryFiles(child, nextParent, output);
  }
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readDirectoryEntries(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = directory.createReader();
    const entries: FileSystemEntry[] = [];

    function readBatch() {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(entries);
            return;
          }
          entries.push(...batch);
          readBatch();
        },
        (error) => reject(error)
      );
    }

    readBatch();
  });
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function inferArchiveBaseName(relativePath: string): string {
  const segment = relativePath.split("/").filter(Boolean)[0];
  if (!segment || !relativePath.includes("/")) {
    return "skill-upload";
  }
  return segment.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "skill-upload";
}

export function isZipFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith(".zip") || file.type === "application/zip";
}
