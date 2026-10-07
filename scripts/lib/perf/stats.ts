// Summaries for the load measurement: nearest-rank percentiles over millisecond samples, and the
// `Server-Timing` header the Edge Functions send (supabase/functions/_shared/timing.ts). Pure.

export interface Summary {
  n: number;
  min: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

/** The value at percentile `p` (0 to 100) of ascending `sorted`, nearest rank; null when empty. */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] ?? null;
}

const round = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

export function summarize(samples: readonly number[]): Summary {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: round(sorted[0] ?? null),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted.at(-1) ?? null),
  };
}

/** "n 120 · p50 38 ms · p95 120 ms · p99 300 ms · max 900 ms" or "no samples". */
export function describe(summary: Summary): string {
  if (summary.n === 0) return "no samples";
  const ms = (value: number | null) => (value === null ? "-" : `${Math.round(value)} ms`);
  return `n ${summary.n} · p50 ${ms(summary.p50)} · p95 ${ms(summary.p95)} · p99 ${ms(summary.p99)} · max ${ms(summary.max)}`;
}

/**
 * Durations of a `Server-Timing` header by metric name, e.g. `auth;dur=1.2, rpc;dur=8` gives
 * { auth: 1.2, rpc: 8 }. Metrics without a duration are left out; a malformed entry is skipped.
 */
export function parseServerTiming(header: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!header) return out;
  for (const entry of header.split(",")) {
    const [rawName, ...params] = entry.split(";").map((part) => part.trim());
    if (!rawName) continue;
    for (const param of params) {
      const match = /^dur=([0-9.]+)$/.exec(param);
      if (match?.[1] !== undefined) {
        const value = Number(match[1]);
        if (Number.isFinite(value)) out[rawName] = value;
      }
    }
  }
  return out;
}

/** Collects samples per name (Server-Timing metrics, phases) and summarises each. */
export class Buckets {
  private readonly values = new Map<string, number[]>();

  add(name: string, value: number): void {
    const list = this.values.get(name);
    if (list) list.push(value);
    else this.values.set(name, [value]);
  }

  addAll(values: Record<string, number>): void {
    for (const [name, value] of Object.entries(values)) this.add(name, value);
  }

  summaries(): Record<string, Summary> {
    return Object.fromEntries([...this.values].map(([name, list]) => [name, summarize(list)]));
  }
}
