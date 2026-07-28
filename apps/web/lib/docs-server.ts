import { readFile } from "node:fs/promises";
import path from "node:path";

const DOCS_DIR = path.join(process.cwd(), "content", "docs");

export async function loadDocFile(filename: string): Promise<string> {
  const filePath = path.join(DOCS_DIR, filename);
  return readFile(filePath, "utf8");
}
