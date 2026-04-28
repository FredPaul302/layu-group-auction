import { describe, expect, it } from "vitest";

import {
  consumeRateLimit,
  createRateLimitKey,
  getClientIp,
  hashRateLimitIdentifier,
  normalizeRateLimitEmail,
  type RateLimitStore
} from "../src/lib/rate-limit/index.js";

function createMemoryStore(): RateLimitStore {
  const entries = new Map<string, { count: number; resetAt: number }>();

  return {
    consume(input) {
      const existing = entries.get(input.key);
      const entry =
        existing && existing.resetAt > input.nowMs
          ? existing
          : {
              count: 0,
              resetAt: input.nowMs + input.windowMs
            };

      entry.count += 1;
      entries.set(input.key, entry);

      const allowed = entry.count <= input.limit;

      return {
        allowed,
        key: input.key,
        limit: input.limit,
        remaining: Math.max(input.limit - entry.count, 0),
        resetAt: entry.resetAt,
        retryAfterSeconds: allowed
          ? 0
          : Math.max(1, Math.ceil((entry.resetAt - input.nowMs) / 1000))
      };
    },
    reset() {
      entries.clear();
    }
  };
}

describe("rate-limit utility", () => {
  it("allows requests until the limit and blocks after it", async () => {
    const store = createMemoryStore();
    const policy = {
      bucket: "test:bucket",
      identifiers: ["user@example.com"],
      limit: 2,
      windowMs: 60_000
    };

    await expect(
      consumeRateLimit(policy, {
        nowMs: 1_000,
        store
      })
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 1
    });

    await expect(
      consumeRateLimit(policy, {
        nowMs: 2_000,
        store
      })
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 0
    });

    await expect(
      consumeRateLimit(policy, {
        nowMs: 3_000,
        store
      })
    ).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: 58
    });
  });

  it("resets a bucket after its window expires", async () => {
    const store = createMemoryStore();
    const policy = {
      bucket: "test:reset",
      identifiers: ["ip-address"],
      limit: 1,
      windowMs: 1_000
    };

    await consumeRateLimit(policy, {
      nowMs: 1_000,
      store
    });

    await expect(
      consumeRateLimit(policy, {
        nowMs: 2_001,
        store
      })
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 0
    });
  });

  it("hashes key identifiers instead of exposing raw email or token values", () => {
    const key = createRateLimitKey("auth:test", [
      normalizeRateLimitEmail("Buyer@Example.COM "),
      "reset-token-secret"
    ]);

    expect(key).toContain("auth:test");
    expect(key).not.toContain("Buyer");
    expect(key).not.toContain("buyer@example.com");
    expect(key).not.toContain("reset-token-secret");
    expect(hashRateLimitIdentifier("buyer@example.com")).toHaveLength(64);
  });

  it("uses the first forwarded IP and falls back to unknown", () => {
    expect(
      getClientIp(
        new Headers({
          "x-forwarded-for": "203.0.113.10, 198.51.100.7"
        })
      )
    ).toBe("203.0.113.10");
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
