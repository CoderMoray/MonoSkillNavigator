import { describe, expect, test } from "vitest";
import {
  VerificationEmailRateLimiter,
  VERIFICATION_EMAIL_RATE_LIMIT_MS,
} from "@skill-platform/storage";

describe("VerificationEmailRateLimiter", () => {
  test("allows unlimited sends when ON_DEV is true", () => {
    const limiter = new VerificationEmailRateLimiter();
    const env = { ON_DEV: "true" };

    limiter.recordAttempt("user-1", env);
    expect(limiter.check("user-1", env)).toEqual({ allowed: true });
  });

  test("blocks a second send within one minute when ON_DEV is false", () => {
    const limiter = new VerificationEmailRateLimiter();
    const env = { ON_DEV: "false" };

    limiter.recordAttempt("user-1", env);
    const blocked = limiter.check("user-1", env);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(Math.ceil(VERIFICATION_EMAIL_RATE_LIMIT_MS / 1000));
    }
  });
});
