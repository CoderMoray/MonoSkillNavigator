import { unzipSync } from "fflate";
import {
  parseSkillFrontmatterHints,
  resolveZipSkillEntryPath,
  type SkillFrontmatterHints
} from "@skill-platform/skill-spec/skill-format";

export async function readSkillFrontmatterFromZip(file: File): Promise<SkillFrontmatterHints | null> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(buffer);
  } catch {
    return null;
  }

  const normalizedEntries = Object.fromEntries(
    Object.entries(entries).map(([name, data]) => [name.replace(/\\/g, "/").replace(/^\/+/, ""), data])
  );
  const paths = Object.keys(normalizedEntries);
  const entryPath = resolveZipSkillEntryPath(paths);
  if (!entryPath) {
    return null;
  }

  const contentBytes = normalizedEntries[entryPath];
  if (!contentBytes) {
    return null;
  }

  const content = new TextDecoder().decode(contentBytes);
  return parseSkillFrontmatterHints(content);
}
