// A small seeded random source (mulberry32, as scripts/lib/sim/rng.ts), so a dry run with the same seed
// prints the same plan and the scheduler tests are deterministic.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  between(min: number, max: number): number;
  /** An integer in [min, max]. */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** One element of a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** One key of `weights`, with probability proportional to its weight (weights > 0). */
  weighted<K extends string>(weights: Readonly<Partial<Record<K, number>>>): K;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: number | string): Rng {
  let state = typeof seed === "number" ? seed >>> 0 : hash(seed);
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    between: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new RangeError("pick from an empty list");
      return item;
    },
    weighted: <K extends string>(weights: Readonly<Partial<Record<K, number>>>): K => {
      const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => w > 0);
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      if (entries.length === 0 || !(total > 0)) throw new RangeError("weighted pick with no positive weight");
      let roll = next() * total;
      for (const [key, weight] of entries) {
        roll -= weight;
        if (roll < 0) return key;
      }
      return (entries.at(-1) as [K, number])[0];
    },
  };
}
