// Pure helpers the student screens share: clock strings, the camera-frame geometry and the locale.
import { BCP47, type Locale } from "@uki/i18n";

const MS_PER_SECOND = 1000;

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function wholeSeconds(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / MS_PER_SECOND);
}

/**
 * A countdown or a duration as the timer, the lobby countdown and the pause lines show it: "42:17",
 * "04:12", "00:42"; from one hour on "1:02:17". Negative and non-finite values show "00:00".
 */
export function formatClock(ms: number): string {
  const total = wholeSeconds(ms);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}`;
  return `${twoDigits(minutes)}:${twoDigits(seconds)}`;
}

/** Time since an event in the widget line, always with hours: "00:47:36" (exam.watch.status {elapsed}). */
export function formatElapsed(ms: number): string {
  const total = wholeSeconds(ms);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${twoDigits(hours)}:${twoDigits(minutes)}:${twoDigits(seconds)}`;
}

/** A 0 to 1 share, clamped; NaN, infinities and a zero total count as 0. */
export function share(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, part / total));
}

/** The student's Locale behind a BCP 47 tag from use-intl ("kk-KZ"), or the fallback. */
export function localeFromTag(tag: string, fallback: Locale): Locale {
  for (const [locale, bcp47] of Object.entries(BCP47) as [Locale, string][]) {
    if (bcp47 === tag || locale === tag) return locale;
  }
  return fallback;
}

/** A rectangle as shares (0 to 1) of a box. */
export interface ShareRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a rectangle given in camera-picture shares lands inside a preview box that shows the picture
 * with object-fit: cover (the box crops the picture's longer side evenly). `mirrored` flips it for a
 * selfie preview. The result is in shares of the box, ready for left/top/width/height percentages.
 */
export function coverRect(
  rect: ShareRect,
  pictureAspect: number,
  boxAspect: number,
  mirrored = false,
): ShareRect {
  const x = mirrored ? 1 - rect.x - rect.width : rect.x;
  if (!(pictureAspect > 0) || !(boxAspect > 0)) return { ...rect, x };
  if (pictureAspect >= boxAspect) {
    // Wider picture: its full height shows, its sides are cropped.
    const scale = pictureAspect / boxAspect;
    return { x: (1 - scale) / 2 + x * scale, y: rect.y, width: rect.width * scale, height: rect.height };
  }
  // Taller picture: its full width shows, top and bottom are cropped.
  const scale = boxAspect / pictureAspect;
  return { x, y: (1 - scale) / 2 + rect.y * scale, width: rect.width, height: rect.height * scale };
}

/** CSS percentages for a ShareRect, for an absolutely placed frame. */
export function rectStyle(rect: ShareRect): { left: string; top: string; width: string; height: string } {
  const percent = (value: number) => `${Math.round(value * 10000) / 100}%`;
  return {
    left: percent(rect.x),
    top: percent(rect.y),
    width: percent(rect.width),
    height: percent(rect.height),
  };
}

/** ISO 8601 for <time dateTime>, or undefined for an invalid instant. */
export function isoTime(epochMs: number): string | undefined {
  const date = new Date(epochMs);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
