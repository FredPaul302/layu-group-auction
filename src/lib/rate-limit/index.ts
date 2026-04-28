import { createHash } from "node:crypto";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitPolicy = {
  bucket: string;
  identifiers: string[];
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  key: string;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export interface RateLimitStore {
  consume(input: {
    key: string;
    limit: number;
    nowMs: number;
    windowMs: number;
  }): RateLimitResult;
  reset(): void;
}

class InMemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, RateLimitEntry>();

  consume(input: {
    key: string;
    limit: number;
    nowMs: number;
    windowMs: number;
  }): RateLimitResult {
    const existingEntry = this.entries.get(input.key);
    const entry =
      existingEntry && existingEntry.resetAt > input.nowMs
        ? existingEntry
        : {
            count: 0,
            resetAt: input.nowMs + input.windowMs
          };

    entry.count += 1;
    this.entries.set(input.key, entry);

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
  }

  reset() {
    this.entries.clear();
  }
}

const globalRateLimitState = globalThis as typeof globalThis & {
  __layuRateLimitStore?: RateLimitStore;
};

function getDefaultRateLimitStore() {
  globalRateLimitState.__layuRateLimitStore ??= new InMemoryRateLimitStore();

  return globalRateLimitState.__layuRateLimitStore;
}

export function hashRateLimitIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createRateLimitKey(bucket: string, identifiers: string[]) {
  return [
    bucket,
    ...identifiers.map((identifier) => hashRateLimitIdentifier(identifier))
  ].join(":");
}

export function normalizeRateLimitEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getClientIp(headers: Pick<Headers, "get">) {
  const forwardedFor = headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

  return firstForwardedIp || "unknown";
}

export async function consumeRateLimit(
  policy: RateLimitPolicy,
  options: {
    nowMs?: number;
    store?: RateLimitStore;
  } = {}
) {
  const nowMs = options.nowMs ?? Date.now();
  const store = options.store ?? getDefaultRateLimitStore();

  return store.consume({
    key: createRateLimitKey(policy.bucket, policy.identifiers),
    limit: policy.limit,
    nowMs,
    windowMs: policy.windowMs
  });
}

export async function consumeRateLimits(
  policies: RateLimitPolicy[],
  options: {
    nowMs?: number;
    store?: RateLimitStore;
  } = {}
) {
  for (const policy of policies) {
    const result = await consumeRateLimit(policy, options);

    if (!result.allowed) {
      return result;
    }
  }

  return null;
}

export function resetRateLimitStoreForTests() {
  getDefaultRateLimitStore().reset();
}

// TODO: Swap the default store for a durable Prisma/Postgres or hosted limiter
// before running multiple production app instances.
