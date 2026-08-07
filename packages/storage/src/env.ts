import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import type { ArtifactStore, MinioArtifactStoreOptions, RegistryStore } from "./types";
import { MinioArtifactStore } from "./store/minio";
import { PostgresRegistryStore } from "./store/postgres";

export function createRegistryStoreFromEnv(env: NodeJS.ProcessEnv = process.env): RegistryStore {
  const artifactStore = createArtifactStoreFromEnv(env);
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  return new PostgresRegistryStore(env.DATABASE_URL, { artifactStore });
}

export function loadDotEnvIfPresent(filePath = ".env"): void {
  const seen = new Set<string>();

  const tryLoad = (baseDir: string): boolean => {
    const absolutePath = path.resolve(baseDir, filePath);
    if (seen.has(absolutePath) || !existsSync(absolutePath)) {
      return false;
    }
    seen.add(absolutePath);
    loadEnvFile(absolutePath);
    return true;
  };

  if (process.env.INIT_CWD && tryLoad(process.env.INIT_CWD)) {
    return;
  }

  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (tryLoad(dir)) {
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
}

export function createArtifactStoreFromEnv(env: NodeJS.ProcessEnv = process.env): ArtifactStore | undefined {
  if (env.MINIO_ENABLED !== "true") {
    return undefined;
  }

  return new MinioArtifactStore({
    endPoint: env.MINIO_ENDPOINT ?? "127.0.0.1",
    port: Number(env.MINIO_PORT ?? 9000),
    useSSL: env.MINIO_USE_SSL === "true",
    accessKey: env.MINIO_ACCESS_KEY ?? "skill_platform",
    secretKey: env.MINIO_SECRET_KEY ?? "skill_platform_secret",
    bucket: env.MINIO_BUCKET ?? "skill-artifacts",
    region: env.MINIO_REGION,
  } satisfies MinioArtifactStoreOptions);
}
