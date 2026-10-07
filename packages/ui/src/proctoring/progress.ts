/** A 0 to 1 share as a percentage with one decimal, clamped; NaN and infinities count as 0. */
export function toPercent(share: number): number {
  if (!Number.isFinite(share)) return 0;
  return Math.round(Math.min(1, Math.max(0, share)) * 1000) / 10;
}
