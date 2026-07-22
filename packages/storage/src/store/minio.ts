import * as Minio from "minio";
import { readSkillZipBuffer, skillSnapshotToZipBuffer, type SkillSnapshot } from "@skill-platform/skill-spec";
import type { ArtifactDescriptor, ArtifactStore, MinioArtifactStoreOptions } from "../types";
import { safeObjectSegment } from "../utils";

export class MinioArtifactStore implements ArtifactStore {
  private readonly client: Minio.Client;
  private bucketReady?: Promise<void>;

  constructor(private readonly options: MinioArtifactStoreOptions) {
    this.client = new Minio.Client({
      endPoint: options.endPoint,
      port: options.port,
      useSSL: options.useSSL,
      accessKey: options.accessKey,
      secretKey: options.secretKey,
    });
  }

  async putSnapshot(slug: string, version: string, snapshot: SkillSnapshot): Promise<ArtifactDescriptor> {
    await this.ensureBucket();
    const body = skillSnapshotToZipBuffer(snapshot);
    const objectKey = `${safeObjectSegment(slug)}/${safeObjectSegment(version)}/${snapshot.contentHash}.zip`;
    await this.client.putObject(this.options.bucket, objectKey, body, body.length, {
      "content-type": "application/zip",
      "x-amz-meta-content-hash": snapshot.contentHash,
    });
    return {
      provider: "minio", bucket: this.options.bucket, objectKey,
      contentHash: snapshot.contentHash, size: body.length,
      storedAt: new Date().toISOString(),
    };
  }

  async getSnapshot(descriptor: ArtifactDescriptor): Promise<SkillSnapshot> {
    const stream = await this.client.getObject(descriptor.bucket, descriptor.objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    return descriptor.objectKey.toLowerCase().endsWith(".zip")
      ? readSkillZipBuffer(body)
      : JSON.parse(body.toString("utf8")) as SkillSnapshot;
  }

  async removeSnapshot(descriptor: ArtifactDescriptor): Promise<void> {
    await this.client.removeObject(descriptor.bucket, descriptor.objectKey);
  }

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      const exists = await this.client.bucketExists(this.options.bucket);
      if (!exists) await this.client.makeBucket(this.options.bucket, this.options.region ?? "us-east-1");
    })();
    return this.bucketReady;
  }
}
