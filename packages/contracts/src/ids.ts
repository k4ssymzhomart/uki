// UUIDv7 for every client-made id (events, stills, outbox rows), with no dependency. Works wherever
// `crypto.getRandomValues` exists: Node 24, Deno, browsers, Electron renderers and extension workers.
import { Uuid } from "./primitives.ts";

interface RandomSource {
  getRandomValues<T extends Uint8Array>(array: T): T;
}

function randomSource(): RandomSource {
  const source = (globalThis as unknown as { crypto?: RandomSource }).crypto;
  if (!source || typeof source.getRandomValues !== "function") {
    throw new Error("crypto.getRandomValues is not available");
  }
  return source;
}

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

const MAX_COUNTER = 0xfff;
let lastMs = -1;
let counter = 0;

/**
 * A UUIDv7 (RFC 9562): 48-bit Unix milliseconds, version 7, a 12-bit counter in `rand_a`, then
 * 62 random bits. Ids made by one process sort in creation order, also within one millisecond and
 * when the clock steps back: the counter starts at a random value with headroom and increments, and on
 * overflow the timestamp borrows the next millisecond.
 */
export function uuidv7(nowMs: number = Date.now()): string {
  const bytes = randomSource().getRandomValues(new Uint8Array(16));
  const now = Math.floor(nowMs);
  if (now > lastMs) {
    lastMs = now;
    // Start below 0x800 so at least 2048 more ids fit in this millisecond.
    counter = (((bytes[6] ?? 0) & 0x07) << 8) | (bytes[7] ?? 0);
  } else {
    counter += 1;
    if (counter > MAX_COUNTER) {
      lastMs += 1;
      counter = 0;
    }
  }
  const ms = lastMs;
  const high = Math.floor(ms / 0x1_0000_0000); // top 16 bits of the 48-bit timestamp
  const low = ms >>> 0; // bottom 32 bits
  bytes[0] = (high >>> 8) & 0xff;
  bytes[1] = high & 0xff;
  bytes[2] = (low >>> 24) & 0xff;
  bytes[3] = (low >>> 16) & 0xff;
  bytes[4] = (low >>> 8) & 0xff;
  bytes[5] = low & 0xff;
  bytes[6] = 0x70 | ((counter >>> 8) & 0x0f);
  bytes[7] = counter & 0xff;
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  let out = "";
  for (let i = 0; i < 16; i += 1) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += "-";
    out += HEX[bytes[i] ?? 0];
  }
  return out;
}

/** The millisecond timestamp inside a UUIDv7, or null for anything else. */
export function uuidv7Time(id: string): number | null {
  if (!isUuid(id) || id[14] !== "7") return null;
  const hex = id.slice(0, 8) + id.slice(9, 13);
  return Number.parseInt(hex, 16);
}

/** True for a UUID that the contracts' `z.uuid()` accepts. */
export function isUuid(value: unknown): value is string {
  return Uuid.safeParse(value).success;
}
