// A small sliding-window limiter, kept in the memory of one Edge Function isolate.
//
// Best effort by design: the platform may run several isolates of a function and recycles them, so the
// real ceiling for a session is "limit per window per isolate". That is enough to stop a runaway outbox
// loop on one laptop, which is what "10 calls a second per session at most" guards against.

export interface RateLimiterOptions {
  /** Calls allowed per key inside one window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Keys remembered at most; the stalest are dropped first. */
  maxKeys?: number;
  /** Clock, for tests. */
  now?: () => number;
}

export class RateLimiter {
  readonly limit: number;
  readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;
  /** Call times per key, oldest first. A Map keeps insertion order, so the first key is the stalest. */
  private readonly hits = new Map<string, number[]>();

  constructor({ limit, windowMs, maxKeys = 10_000, now = Date.now }: RateLimiterOptions) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
    if (!(windowMs > 0)) throw new RangeError("windowMs must be positive");
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.now = now;
  }

  /** Records a call for `key` and says whether it is within the limit. A refused call is not recorded. */
  hit(key: string): boolean {
    const now = this.now();
    const since = now - this.windowMs;
    const times = (this.hits.get(key) ?? []).filter((at) => at > since);
    const allowed = times.length < this.limit;
    if (allowed) times.push(now);
    // Re-insert so this key becomes the freshest.
    this.hits.delete(key);
    if (times.length > 0) this.hits.set(key, times);
    this.evict();
    return allowed;
  }

  /** Keys currently remembered, for tests. */
  get size(): number {
    return this.hits.size;
  }

  private evict(): void {
    while (this.hits.size > this.maxKeys) {
      const stalest = this.hits.keys().next();
      if (stalest.done) return;
      this.hits.delete(stalest.value);
    }
  }
}
