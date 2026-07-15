import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ArtifactStore, RegistryData, FileRegistryStoreOptions } from "../types";
import { JsonRegistryStore } from "./base";
import { isNotFoundError, emptyRegistry, normalizeRegistryData } from "../utils";

export class FileRegistryStore extends JsonRegistryStore {
  private readonly registryPath: string;

  constructor(dataDir = ".data", options: FileRegistryStoreOptions = {}) {
    super(options.artifactStore);
    const baseDir = path.isAbsolute(dataDir) ? "" : process.env.INIT_CWD ?? process.cwd();
    this.registryPath = path.join(path.resolve(baseDir, dataDir), "registry.json");
  }

  protected async load(): Promise<RegistryData> {
    try {
      const raw = await readFile(this.registryPath, "utf8");
      return normalizeRegistryData(JSON.parse(raw) as RegistryData);
    } catch (error) {
      if (isNotFoundError(error)) return structuredClone(emptyRegistry);
      throw error;
    }
  }

  protected async save(data: RegistryData): Promise<void> {
    await mkdir(path.dirname(this.registryPath), { recursive: true });
    const tempPath = `${this.registryPath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tempPath, this.registryPath);
  }
}
