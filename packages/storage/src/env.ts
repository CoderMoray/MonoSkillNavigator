import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import type { ArtifactStore, RegistryStore } from "./types";
import type { MinioArtifactStoreOptions } from "./types";
import { FileRegistryStore } from "./store/file";
import { MinioArtifactStore } from "./store/minio";
import { PostgresRegistryStore } from "./store/postgres";

export function createRegistryStoreFromEnv(env: NodeJS.ProcessEnv = process.env): RegistryStore {
  const artifactStore = createArtifactStoreFromEnv(env);
  const storeType = env.REGISTRY_STORE ?? (env.DATABASE_URL ? "postgres" : "file");

  if (storeType === "postgres") {
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when REGISTRY_STORE=postgres");
    }
    return new PostgresRegistryStore(env.DATABASE_URL, { artifactStore });
  }

  return new FileRegistryStore(env.DATA_DIR ?? ".data", { artifactStore });
}

export function loadDotEnvIfPresent(filePath = ".env"): void {
  const absolutePath = path.resolve(process.env.INIT_CWD ?? process.cwd(), filePath);
  if (existsSync(absolutePath)) {
    loadEnvFile(absolutePath);
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
