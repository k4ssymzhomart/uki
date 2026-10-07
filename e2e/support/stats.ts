// Latency summaries for the report: nearest-rank percentiles over millisecond samples.

export interface LatencySummary {
  n: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
}

/** The value at percentile `p` (0 to 100) by the nearest-rank method; NaN for no samples. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] ?? Number.NaN;
}

export function summarize(samples: readonly number[]): LatencySummary {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0] ?? Number.NaN,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.at(-1) ?? Number.NaN,
  };
}

export function describeLatency(label: string, summary: LatencySummary): string {
  const ms = (value: number) => `${Math.round(value)} ms`;
  return `${label}: n=${summary.n} p50 ${ms(summary.p50)} p95 ${ms(summary.p95)} max ${ms(summary.max)}`;
}
