export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
}

interface BucketEntry {
  count: number;
  resetAtMs: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, BucketEntry>();
  private lastPruneAt = 0;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly nowFn: () => number;

  constructor(
    maxRequests: number,
    windowMs: number,
    nowFn: () => number = () => Date.now(),
  ) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.nowFn = nowFn;
  }

  consume(key: string): RateLimitDecision {
    const now = this.nowFn();
    if (now - this.lastPruneAt >= this.windowMs) {
      this.prune(now);
      this.lastPruneAt = now;
    }

    const existing = this.buckets.get(key);
    if (!existing || now >= existing.resetAtMs) {
      const resetAtMs = now + this.windowMs;
      this.buckets.set(key, { count: 1, resetAtMs });
      return {
        allowed: true,
        limit: this.maxRequests,
        remaining: Math.max(0, this.maxRequests - 1),
        resetAtMs,
        retryAfterSeconds: 0,
      };
    }

    if (existing.count >= this.maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetAtMs - now) / 1000),
      );
      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetAtMs: existing.resetAtMs,
        retryAfterSeconds,
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - existing.count),
      resetAtMs: existing.resetAtMs,
      retryAfterSeconds: 0,
    };
  }

  private prune(now: number): void {
    for (const [k, entry] of this.buckets.entries()) {
      if (now >= entry.resetAtMs) {
        this.buckets.delete(k);
      }
    }
  }
}

export class ConcurrencyLimiter {
  private readonly inFlight = new Map<string, number>();
  private readonly maxConcurrentPerKey: number;

  constructor(maxConcurrentPerKey: number) {
    this.maxConcurrentPerKey = maxConcurrentPerKey;
  }

  tryAcquire(key: string): (() => void) | null {
    const current = this.inFlight.get(key) ?? 0;
    if (current >= this.maxConcurrentPerKey) {
      return null;
    }
    this.inFlight.set(key, current + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const latest = this.inFlight.get(key) ?? 1;
      if (latest <= 1) {
        this.inFlight.delete(key);
      } else {
        this.inFlight.set(key, latest - 1);
      }
    };
  }
}
