// Shared primitives for every contract. Runs in Node, browsers, the Lock's service worker and Deno:
// the only external import is "zod".
import { z } from "zod";

/** RFC 9562 UUID (Zod 4 checks the version and variant nibbles). */
export const Uuid = z.uuid();

/** A UTC instant written by a client with `Date.prototype.toISOString()`: always ends in `Z`. */
export const UtcTimestamp = z.iso.datetime();

/**
 * An instant read from Postgres (PostgREST, RPC results, `realtime.send` payloads). Postgres writes
 * `timestamptz` as `2026-10-07T10:00:00.123456+00:00`, so an offset is accepted as well as `Z`.
 */
export const Timestamp = z.iso.datetime({ offset: true });

const HOST_PATTERN = /^(?:\[[0-9a-f:.]+\]|[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.?)(?::\d{1,5})?$/i;

/**
 * A host name, optionally with a port, never a URL: no scheme, path, query or fragment.
 * `wikipedia.org`, `localhost:5180` and `127.0.0.1` pass; `https://wikipedia.org/wiki/X` fails.
 */
export const Host = z.string().min(1).max(260).regex(HOST_PATTERN);
export type Host = z.infer<typeof Host>;

/** Milliseconds since the epoch for any accepted instant form. */
export function toMs(value: string | number | Date): number {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return Date.parse(value);
}
