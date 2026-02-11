import { getRedisClient } from "@/lib/redis";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  blockMs?: number;
};

type Bucket = {
  count: number;
  windowStart: number;
  blockedUntil?: number;
};

const buckets = new Map<string, Bucket>();

function nowMs() {
  return Date.now();
}

function getBucket(key: string): Bucket {
  const existing = buckets.get(key);
  if (existing) return existing;
  const created: Bucket = { count: 0, windowStart: nowMs() };
  buckets.set(key, created);
  return created;
}

export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const redis = getRedisClient();
  if (!redis) {
    const bucket = getBucket(key);
    const now = nowMs();

    if (bucket.blockedUntil && bucket.blockedUntil > now) {
      return { allowed: false, retryAfterMs: bucket.blockedUntil - now };
    }

    if (now - bucket.windowStart > opts.windowMs) {
      bucket.windowStart = now;
      bucket.count = 0;
      bucket.blockedUntil = undefined;
    }

    if (bucket.count >= opts.limit) {
      if (opts.blockMs && opts.blockMs > 0) {
        bucket.blockedUntil = now + opts.blockMs;
        return { allowed: false, retryAfterMs: opts.blockMs };
      }
      return { allowed: false };
    }

    return { allowed: true };
  }

  const now = nowMs();
  const blockKey = `rl:${key}:block`;
  const countKey = `rl:${key}:count`;

  const blockedUntilRaw = await redis.get(blockKey);
  if (blockedUntilRaw) {
    const blockedUntil = Number(blockedUntilRaw);
    if (Number.isFinite(blockedUntil) && blockedUntil > now) {
      return { allowed: false, retryAfterMs: blockedUntil - now };
    }
  }

  const countRaw = await redis.get(countKey);
  const count = countRaw ? Number(countRaw) : 0;
  if (Number.isFinite(count) && count >= opts.limit) {
    if (opts.blockMs && opts.blockMs > 0) {
      const blockedUntil = now + opts.blockMs;
      await redis.set(blockKey, String(blockedUntil), "PX", opts.blockMs);
      return { allowed: false, retryAfterMs: opts.blockMs };
    }
    return { allowed: false };
  }

  return { allowed: true };
}

export async function recordFailure(key: string, opts: RateLimitOptions) {
  const redis = getRedisClient();
  if (!redis) {
    const bucket = getBucket(key);
    const now = nowMs();

    if (now - bucket.windowStart > opts.windowMs) {
      bucket.windowStart = now;
      bucket.count = 0;
      bucket.blockedUntil = undefined;
    }

    bucket.count += 1;
    if (bucket.count >= opts.limit && opts.blockMs && opts.blockMs > 0) {
      bucket.blockedUntil = now + opts.blockMs;
    }
    return;
  }

  const now = nowMs();
  const countKey = `rl:${key}:count`;
  const blockKey = `rl:${key}:block`;

  const count = await redis.incr(countKey);
  if (count === 1) {
    await redis.pexpire(countKey, opts.windowMs);
  }

  if (count >= opts.limit && opts.blockMs && opts.blockMs > 0) {
    const blockedUntil = now + opts.blockMs;
    await redis.set(blockKey, String(blockedUntil), "PX", opts.blockMs);
  }
}

export async function clearAttempts(key: string) {
  const redis = getRedisClient();
  if (!redis) {
    buckets.delete(key);
    return;
  }
  await redis.del(`rl:${key}:count`, `rl:${key}:block`);
}
