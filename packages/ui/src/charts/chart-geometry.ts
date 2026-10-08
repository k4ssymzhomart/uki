// Pure geometry for the kit's charts (Figma Chart/Line 150:2809, Chart/Bars 150:2833, Chart/Donut
// 150:2868) and A.1's plots (102:10678, 102:10745, 102:10770): scales, ticks, bar and point positions and
// SVG paths. No chart library (Phase 1 plan, Decisions: Reports page). Every function takes plain numbers
// in the SVG's user units, so the components stay thin and the numbers are unit-tested.

export type Point = { x: number; y: number };

/** Steps a value axis may use, times a power of ten: 0, 4, 8, 12 for A.1's 11.6. */
const NICE_STEPS = [1, 2, 2.5, 4, 5] as const;

/** Rounds away binary noise (0.1 + 0.2), so ticks and labels print as written. */
export function tidy(value: number): number {
  return Number(value.toPrecision(12));
}

/** The smallest nice step at least `rough`: 3.87 gives 4, 0.3 gives 0.4, 0 or less gives 1. */
export function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(rough));
  for (const step of NICE_STEPS) {
    if (tidy(step * power) >= tidy(rough)) return tidy(step * power);
  }
  return tidy(10 * power);
}

/**
 * The ticks of a zero-based value axis with `intervals` equal steps that reach `max`: A.1 and Chart/Line
 * draw four grid lines, 0 to 12 for a top value of 11.6. Without data the axis still has its lines.
 */
export function niceTicks(max: number, intervals = 3, minStep = 0): number[] {
  const steps = Math.max(1, Math.round(intervals));
  const step = Math.max(niceStep(Math.max(0, max) / steps), minStep);
  return Array.from({ length: steps + 1 }, (_, index) => tidy(step * index));
}

/** A linear map from `domain` to `range`; an empty domain maps everything to the middle of the range. */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d0 === d1) return () => (r0 + r1) / 2;
  return (value) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

/** Numbers in a path, to two decimals without trailing zeros. */
export function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export type Band = { x: number; width: number; center: number };

/**
 * `count` equal slots across [left, left + width], each with a bar centred in it: A.1's six weeks give
 * 96-wide slots with 56-wide bars (7/12 of the slot, never wider than `maxBar`).
 */
export function bands(count: number, left: number, width: number, maxBar = 56): Band[] {
  if (count <= 0) return [];
  const slot = width / count;
  const bar = Math.min(maxBar, (slot * 7) / 12);
  return Array.from({ length: count }, (_, index) => {
    const center = left + slot * index + slot / 2;
    return { x: center - bar / 2, width: bar, center };
  });
}

/** Indexes of the slots whose labels fit: every one at 48 units a slot or more, else every n-th and the last. */
export function labelledIndexes(count: number, slot: number, minSlot = 48): number[] {
  if (count <= 0) return [];
  const every = slot >= minSlot ? 1 : Math.ceil(minSlot / Math.max(slot, 1));
  const indexes = new Set<number>();
  for (let index = 0; index < count; index += every) indexes.add(index);
  indexes.add(count - 1);
  return [...indexes].sort((a, b) => a - b);
}

/** A bar with rounded top corners (A.1's weekly bars, 8 radius), standing on y + height. */
export function roundedTopRect(x: number, y: number, width: number, height: number, radius: number): string {
  if (width <= 0 || height <= 0) return "";
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return [
    `M${fmt(x)} ${fmt(y + height)}`,
    `V${fmt(y + r)}`,
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x + r)} ${fmt(y)}`,
    `H${fmt(x + width - r)}`,
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x + width)} ${fmt(y + r)}`,
    `V${fmt(y + height)}`,
    "Z",
  ].join("");
}

/** Evenly spaced x positions from `left` to `right`, first and last on the ends; one point sits in the middle. */
export function spread(count: number, left: number, right: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(left + right) / 2];
  const step = (right - left) / (count - 1);
  return Array.from({ length: count }, (_, index) => left + step * index);
}

/** A polyline through the points. */
export function linePath(points: readonly Point[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${fmt(point.x)} ${fmt(point.y)}`).join("");
}

/** The area under a line down to `baseline`; empty without points. */
export function areaPath(points: readonly Point[], baseline: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return "";
  return `M${fmt(first.x)} ${fmt(baseline)}${points
    .map((point) => `L${fmt(point.x)} ${fmt(point.y)}`)
    .join("")}L${fmt(last.x)} ${fmt(baseline)}Z`;
}

/**
 * A.1's review-time line (102:10770) has no value axis: the highest value sits 13 % from the top and the
 * lowest 78 %, as the frame draws 2:30 and 1:40 in a 132-high plot. Equal values sit in the middle of
 * that band.
 */
export const FIT_BAND = { top: 0.13, bottom: 0.78 } as const;

export function fitScale(values: readonly number[], height: number): (value: number) => number {
  const finite = values.filter(Number.isFinite);
  const lo = finite.length > 0 ? Math.min(...finite) : 0;
  const hi = finite.length > 0 ? Math.max(...finite) : 0;
  return linearScale([hi, lo], [height * FIT_BAND.top, height * FIT_BAND.bottom]);
}

/**
 * Whole percentages that add up to 100 (largest remainder), so a legend never reads 99 % or 101 %:
 * 214, 61 and 23 give 72, 20 and 8. All zeros give zeros.
 */
export function shares(values: readonly number[]): number[] {
  const clean = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const total = clean.reduce((sum, value) => sum + value, 0);
  if (total === 0) return clean.map(() => 0);
  const exact = clean.map((value) => (value * 100) / total);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    left -= 1;
  }
  return floors;
}

/** A point on a circle at `degrees` clockwise from 12 o'clock. */
export function polar(cx: number, cy: number, radius: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return { x: cx + radius * Math.sin(radians), y: cy - radius * Math.cos(radians) };
}

export type DonutGeometry = { size: number; thickness: number; gapDegrees: number };

/** Chart/Donut: a 168 ring, 22 thick, with 2° gaps between segments. */
export const DONUT: DonutGeometry = { size: 168, thickness: 22, gapDegrees: 2 };

/**
 * The ring's segments, clockwise from 12 o'clock with a gap between neighbours (Chart/Donut 150:2868):
 * one path per value, empty for a zero value. A value that is the whole is the full ring, with no gap.
 */
export function donutPaths(values: readonly number[], geometry: DonutGeometry = DONUT): string[] {
  const { size, thickness, gapDegrees } = geometry;
  const clean = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const total = clean.reduce((sum, value) => sum + value, 0);
  const c = size / 2;
  const outer = size / 2;
  const inner = outer - thickness;
  if (total === 0) return clean.map(() => "");
  if (clean.filter((value) => value > 0).length === 1) {
    return clean.map((value) => (value > 0 ? ringPath(c, outer, inner) : ""));
  }
  let start = 0;
  return clean.map((value) => {
    const sweep = (value / total) * 360;
    const a0 = start + gapDegrees / 2;
    const a1 = start + sweep - gapDegrees / 2;
    start += sweep;
    if (value === 0 || a1 <= a0) return "";
    const large = a1 - a0 > 180 ? 1 : 0;
    const p0 = polar(c, c, outer, a0);
    const p1 = polar(c, c, outer, a1);
    const q1 = polar(c, c, inner, a1);
    const q0 = polar(c, c, inner, a0);
    return [
      `M${fmt(p0.x)} ${fmt(p0.y)}`,
      `A${fmt(outer)} ${fmt(outer)} 0 ${large} 1 ${fmt(p1.x)} ${fmt(p1.y)}`,
      `L${fmt(q1.x)} ${fmt(q1.y)}`,
      `A${fmt(inner)} ${fmt(inner)} 0 ${large} 0 ${fmt(q0.x)} ${fmt(q0.y)}`,
      "Z",
    ].join("");
  });
}

/** A full ring (two half-circle arcs each way), drawn with the even-odd rule. */
function ringPath(c: number, outer: number, inner: number): string {
  const circle = (r: number) =>
    `M${fmt(c)} ${fmt(c - r)}A${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(c)} ${fmt(c + r)}A${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(c)} ${fmt(c - r)}Z`;
  return `${circle(outer)}${circle(inner)}`;
}

/** Chart/Bars (150:2833): the top share fills 95 % of its track and the others follow it. */
export const BAR_TOP_FILL = 0.95;

/** The width of each bar as a fraction of its track; zero without data. */
export function barFractions(values: readonly number[]): number[] {
  const top = Math.max(0, ...values.filter(Number.isFinite));
  if (top === 0) return values.map(() => 0);
  return values.map((value) => (Number.isFinite(value) && value > 0 ? (value / top) * BAR_TOP_FILL : 0));
}
