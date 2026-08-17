import { describe, expect, test } from "vitest";
import { isOnDev, PublishRateLimiter, PUBLISH_RATE_LIMIT_MS } from "@skill-platform/storage";

describe("isOnDev", () => {
  test("returns true only when ON_DEV is true", () => {
    expect(isOnDev({ ON_DEV: "true" })).toBe(true);
    expect(isOnDev({ ON_DEV: "TRUE" })).toBe(true);
    expect(isOnDev({ ON_DEV: "false" })).toBe(false);
    expect(isOnDev({})).toBe(false);
  });
});

describe("PublishRateLimiter", () => {
  test("allows unlimited publishes when ON_DEV is true", () => {
    const limiter = new PublishRateLimiter();
    const env = { ON_DEV: "true" };

    limiter.recordAttempt("user-1", env);
    expect(limiter.check("user-1", env)).toEqual({ allowed: true });
    limiter.recordAttempt("user-1", env);
    expect(limiter.check("user-1", env)).toEqual({ allowed: true });
  });

  test("blocks a second publish within one minute when ON_DEV is false", () => {
    const limiter = new PublishRateLimiter();
    const env = { ON_DEV: "false" };

    limiter.recordAttempt("user-1", env);
    const blocked = limiter.check("user-1", env);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(Math.ceil(PUBLISH_RATE_LIMIT_MS / 1000));
    }
  });

  test("allows publish again after the cooldown window", () => {
    const limiter = new PublishRateLimiter();
    const env = { ON_DEV: "false" };
    const userId = "user-2";
    const start = Date.now();

    limiter.recordAttempt(userId, env);
    expect(limiter.check(userId, env).allowed).toBe(false);

    const originalNow = Date.now;
    Date.now = () => start + PUBLISH_RATE_LIMIT_MS;
    try {
      expect(limiter.check(userId, env)).toEqual({ allowed: true });
    } finally {
      Date.now = originalNow;
    }
  });
});
