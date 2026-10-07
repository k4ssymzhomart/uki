// Latency samples and a concurrency limit for the simulator's calls.

/** Keeps the last `capacity` samples and answers percentiles over them. */
export class Samples {
  private readonly values: number[] = [];
  private total = 0;

  constructor(private readonly capacity = 5000) {}

  add(value: number): void {
    this.values.push(value);
    this.total += 1;
    if (this.values.length > this.capacity) this.values.shift();
  }

  get count(): number {
    return this.total;
  }

  /** The `p`-th percentile (0 to 100) of the kept samples, nearest rank; null when empty. */
  percentile(p: number): number | null {
    if (this.values.length === 0) return null;
    const sorted = [...this.values].sort((a, b) => a - b);
    const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[rank] ?? null;
  }

  max(): number | null {
    return this.values.length === 0 ? null : Math.max(...this.values);
  }
}

/** Runs at most `limit` tasks at once; the rest wait in order. */
export class Limiter {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  get inFlight(): number {
    return this.active;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      // The finishing task hands its slot over, so `active` already counts this one.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active += 1;
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active -= 1;
    }
  }
}

/** "p50 38 ms · p95 120 ms · max 300 ms" or "no samples". */
export function describeLatency(samples: Samples): string {
  const p50 = samples.percentile(50);
  const p95 = samples.percentile(95);
  const max = samples.max();
  if (p50 === null || p95 === null || max === null) return "no samples";
  return `p50 ${Math.round(p50)} ms · p95 ${Math.round(p95)} ms · max ${Math.round(max)} ms`;
}
