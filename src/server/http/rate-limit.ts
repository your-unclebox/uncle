import "server-only";

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowMs: number, now?: Date): Promise<RateLimitResult>;
}

/**
 * Fixed-window di memori proses. Cukup untuk development & satu instance.
 * Production (Vercel, banyak instance) wajib memakai Upstash Redis
 * (DRD Security §4) — belum dipasang karena kredensial belum tersedia.
 */
export class MemoryRateLimiter implements RateLimiter {
  readonly #hits = new Map<string, { count: number; resetAt: number }>();

  async consume(key: string, limit: number, windowMs: number, now = new Date()) {
    const time = now.getTime();
    const entry = this.#hits.get(key);
    if (!entry || entry.resetAt <= time) {
      this.#hits.set(key, { count: 1, resetAt: time + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    const retryAfterSeconds = Math.ceil((entry.resetAt - time) / 1000);
    return { allowed: entry.count <= limit, retryAfterSeconds };
  }
}

let defaultLimiter: RateLimiter | undefined;
export function getRateLimiter(): RateLimiter {
  defaultLimiter ??= new MemoryRateLimiter();
  return defaultLimiter;
}
