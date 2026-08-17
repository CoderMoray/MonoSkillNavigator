import { isOnDev } from "./env";

export const PUBLISH_RATE_LIMIT_MS = 60_000;

export type PublishRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export class PublishRateLimiter {
  private readonly lastAttemptAtByUserId = new Map<string, number>();

  check(userId: string, env: NodeJS.ProcessEnv = process.env): PublishRateLimitResult {
    if (isOnDev(env)) {
      return { allowed: true };
    }

    const lastAttemptAt = this.lastAttemptAtByUserId.get(userId);
    if (lastAttemptAt === undefined) {
      return { allowed: true };
    }

    const elapsedMs = Date.now() - lastAttemptAt;
    if (elapsedMs >= PUBLISH_RATE_LIMIT_MS) {
      return { allowed: true };
    }

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((PUBLISH_RATE_LIMIT_MS - elapsedMs) / 1000))
    };
  }

  recordAttempt(userId: string, env: NodeJS.ProcessEnv = process.env): void {
    if (isOnDev(env)) {
      return;
    }
    this.lastAttemptAtByUserId.set(userId, Date.now());
  }
}
