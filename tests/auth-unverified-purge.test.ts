import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FileAuthStore } from "@skill-platform/storage";

describe("purgeExpiredUnverifiedUsers", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "auth-purge-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("removes unverified users older than retention window", async () => {
    const store = new FileAuthStore(tempDir);
    await store.register("admin", "password123", "admin@example.com", { autoVerifyEmail: true });
    const oldUser = await store.register("old-user", "password123", "old@example.com");
    const recentUser = await store.register("recent-user", "password123", "recent@example.com");

    const dataPath = path.join(tempDir, "users.json");
    const raw = await import("node:fs/promises").then((fs) => fs.readFile(dataPath, "utf8"));
    const data = JSON.parse(raw) as {
      users: Record<string, { createdAt: string; emailVerifiedAt: string | null }>;
    };
    data.users[oldUser.id]!.createdAt = new Date(Date.now() - 4 * 86_400_000).toISOString();
    data.users[recentUser.id]!.createdAt = new Date(Date.now() - 1 * 86_400_000).toISOString();
    await import("node:fs/promises").then((fs) => fs.writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8"));

    const removed = await store.purgeExpiredUnverifiedUsers(3);
    expect(removed).toBe(1);
    expect(await store.getUserByUsername("old-user")).toBeUndefined();
    expect(await store.getUserByUsername("recent-user")).toBeDefined();
  });

  test("does not remove the last unverified administrator", async () => {
    const store = new FileAuthStore(tempDir);
    await store.register("solo-admin", "password123", "admin@example.com");

    const dataPath = path.join(tempDir, "users.json");
    const raw = await import("node:fs/promises").then((fs) => fs.readFile(dataPath, "utf8"));
    const data = JSON.parse(raw) as {
      users: Record<string, { createdAt: string; emailVerifiedAt: string | null }>;
    };
    const userId = Object.keys(data.users)[0]!;
    data.users[userId]!.createdAt = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await import("node:fs/promises").then((fs) => fs.writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8"));

    const removed = await store.purgeExpiredUnverifiedUsers(3);
    expect(removed).toBe(0);
    expect(await store.getUserByUsername("solo-admin")).toBeDefined();
  });
});
