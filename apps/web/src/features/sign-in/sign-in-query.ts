import type { Route } from "next";
import { z } from "zod";

/**
 * What A.0 Sign in reads from its address (the judge path, a user request of 9 October; no Figma
 * frame): `?email=` fills in the email field, and `?next=` is where sign-in goes afterwards instead of
 * the role landing, as the landing's Live demo button uses it
 * (`/sign-in?email=judge%40kru.test&next=/demo/live`).
 */

/** The longest `next` path sign-in follows; anything longer is ignored. */
const NEXT_MAX = 512;

/** A stand-in origin to resolve a path against: only its own origin may come out. */
const BASE = "https://uki.invalid";

/**
 * A path on this site: one "/" first, never "//" or "/\" (a browser reads both as another host), and no
 * backslash, whitespace or control character anywhere (a browser drops tabs and newlines, so "/\t/x"
 * would become "//x"). A scheme cannot come first, since the path starts with "/".
 */
const PATH_SHAPE = /^\/(?![/\\])[^\s\\\p{Cc}]*$/u;

/** Sign-in itself is never a destination, so `next` cannot send sign-in back to itself. */
const SIGN_IN = /^\/sign-in(?:[/?#]|$)/;

/**
 * `?next=` when it is safe to follow after sign-in: a path on this site (see PATH_SHAPE) that still
 * resolves to this origin with no "//" at its start once dot segments are resolved ("/..//x" and
 * "/%2e%2e//x" both would), and not sign-in itself. Returns the path as given, or null: then sign-in
 * goes to the role landing as before.
 */
export const SafeNextPath = z
  .string()
  .max(NEXT_MAX)
  .regex(PATH_SHAPE)
  .refine((path) => !SIGN_IN.test(path))
  .refine((path) => {
    try {
      const url = new URL(path, BASE);
      return url.origin === BASE && !url.pathname.startsWith("//");
    } catch {
      return false;
    }
  });

/** The safe `next` path in `value`, or null for anything else (absent, repeated, another site, too long). */
export function safeNextPath(value: unknown): Route | null {
  const parsed = SafeNextPath.safeParse(value);
  return parsed.success ? (parsed.data as Route) : null;
}

/** `?email=` when it is an email address; anything else leaves the field empty. */
const PrefillEmail = z.string().trim().max(254).pipe(z.email());

export function prefillEmail(value: unknown): string {
  const parsed = PrefillEmail.safeParse(value);
  return parsed.success ? parsed.data : "";
}

export type SignInQuery = { email: string; next: Route | null };

/** The sign-in page's search params as the form uses them; a repeated parameter counts as absent. */
export function signInQuery(params: Record<string, string | string[] | undefined>): SignInQuery {
  return { email: prefillEmail(params.email), next: safeNextPath(params.next) };
}
