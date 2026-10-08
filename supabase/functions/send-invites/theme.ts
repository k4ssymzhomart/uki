// What the invite email (0.8, 161:13438) is styled with. Inboxes take inline styles only, so the email
// cannot use the Tailwind classes; the colours, radii and spacing come from packages/tokens (copied by
// `pnpm functions:sync` into email-tokens.ts) and the type from 0.8's text styles. Fonts are the
// system's: Gmail and Apple Mail load no web font, and every font below draws the Kazakh letters
// (Ә Ғ Қ Ң Ө Ұ Ү Һ І), so no glyph falls back to another face mid-word.
import type { CSSProperties } from "react";
import { EMAIL_TOKENS } from "../_shared/contracts/email-tokens.ts";

export const color = EMAIL_TOKENS.color;
export const radius = EMAIL_TOKENS.radius;
export const space = EMAIL_TOKENS.space;

/** Geist's place in the email: San Francisco, Segoe UI, Roboto, then Helvetica and Arial. */
export const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
/** Geist Mono's place: SF Mono, Menlo, Consolas. */
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

function channels(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`not a #rrggbb colour: ${hex}`);
  return [
    Number.parseInt(match[1] ?? "0", 16),
    Number.parseInt(match[2] ?? "0", 16),
    Number.parseInt(match[3] ?? "0", 16),
  ];
}

/**
 * `fg` at `alpha` over `bg`, as one opaque colour: 0.8 dims text with opacity, which not every inbox
 * applies, so the email paints the colour the frame shows instead.
 */
export function over(fg: string, bg: string, alpha: number): string {
  const top = channels(fg);
  const bottom = channels(bg);
  return `#${top
    .map((value, i) => Math.round(value * alpha + (bottom[i] ?? 0) * (1 - alpha)))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** 0.8's text styles (Figma): size, line height and tracking, with the weight each one uses. */
export const type = {
  /** UI/Title: Geist SemiBold 26/1.2, -1.5 % tracking. */
  title: { fontSize: "26px", lineHeight: 1.2, letterSpacing: "-0.39px", fontWeight: 600 },
  /** Body/S: Geist Regular 15/1.5. */
  body: { fontSize: "15px", lineHeight: 1.5, fontWeight: 400 },
  /** Label/M: Geist Medium 15/1.3 (the button). */
  labelM: { fontSize: "15px", lineHeight: 1.3, fontWeight: 500 },
  /** UI/Label: Geist Medium 13/1.3. */
  label: { fontSize: "13px", lineHeight: 1.3, fontWeight: 500 },
  /** Card/Caption: Geist Regular 14/1.45. */
  caption: { fontSize: "14px", lineHeight: 1.45, fontWeight: 400 },
  /** Mono/Tag: Geist Mono Medium 11/1.2, 6 % tracking, capitals. */
  tag: {
    fontFamily: MONO,
    fontSize: "11px",
    lineHeight: 1.2,
    letterSpacing: "0.66px",
    fontWeight: 500,
    textTransform: "uppercase",
  },
} as const satisfies Record<string, CSSProperties>;

/** Phones (the 390 px check): a narrower card and smaller hero and code, as classes Gmail keeps. */
export const PHONE_CSS = `@media only screen and (max-width: 480px) {
  .uki-stage { padding: ${space["12"]}px 0 !important; }
  .uki-card { padding: ${space["20"]}px ${space["16"]}px !important; border-radius: ${radius.md}px !important; }
  .uki-hero { padding: ${space["16"]}px !important; }
  .uki-mascot { width: 64px !important; height: 64px !important; }
  .uki-mascot-cell { width: 76px !important; }
  .uki-title { font-size: 21px !important; }
  .uki-code { padding: ${space["12"]}px 14px !important; }
  .uki-code-value { font-size: 19px !important; }
}`;
