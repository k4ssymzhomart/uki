// Clock strings for the wall: digits and colons only, so they are not copy.

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "00:42" for a pause or a silence, "1:02:03" past an hour. Negative input counts as 0. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** "00:42:17": time left in the breadcrumb, always with hours. Negative input counts as 0. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Milliseconds as seconds rounded to one decimal, for "{seconds, number, ::.#} s" (2.4 s, 6 s). */
export function toSeconds(ms: number): number {
  return Math.round(Math.max(0, ms) / 100) / 10;
}
