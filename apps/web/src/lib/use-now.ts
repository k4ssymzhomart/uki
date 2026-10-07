"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { getPublicEnv } from "./env.ts";

/**
 * A browser clock this far from the server's is corrected. A smaller gap is within the measurement's
 * error (the Date header counts whole seconds) and is left alone.
 */
export const CLOCK_SKEW_MS = 2000;

/** A round trip slower than this says too little about the server's clock; the sample is dropped. */
const MAX_ROUND_TRIP_MS = 2000;

/** Round trips per measurement; the fastest wins (the first may also wait for a CORS preflight). */
const SAMPLES = 2;

/** An HTTP Date header ("Wed, 07 Oct 2026 20:06:23 GMT") as epoch milliseconds. */
const HttpDate = z
  .string()
  .transform((value) => Date.parse(value))
  .pipe(z.number().int());

/**
 * Server clock minus this browser's clock, from the Supabase API's Date header: the middle of that
 * whole second against the middle of the request, from the fastest of SAMPLES round trips. Null when
 * no usable answer came.
 */
export async function measureServerOffset(
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  now: () => number = () => Date.now(),
): Promise<number | null> {
  let best: { offset: number; roundTrip: number } | null = null;
  try {
    const env = getPublicEnv();
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const sent = now();
      const response = await fetchImpl(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
        method: "HEAD",
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
        cache: "no-store",
      });
      const received = now();
      const date = HttpDate.safeParse(response.headers.get("date"));
      const roundTrip = received - sent;
      if (!date.success || roundTrip > MAX_ROUND_TRIP_MS) continue;
      if (best === null || roundTrip < best.roundTrip) {
        best = { offset: date.data + 500 - (sent + received) / 2, roundTrip };
      }
    }
  } catch {
    // No answer, or no configuration: keep what was measured, if anything.
  }
  return best === null ? null : Math.round(best.offset);
}

/**
 * Server clock minus this browser's clock, measured once after hydration; 0 until then, without an
 * answer, and when the gap is under CLOCK_SKEW_MS. `measure` must be a stable function.
 */
export function useServerOffset(measure: () => Promise<number | null> = measureServerOffset): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void measure().then((measured) => {
      if (cancelled || measured === null) return;
      setOffset(Math.abs(measured) > CLOCK_SKEW_MS ? measured : 0);
    });
    return () => {
      cancelled = true;
    };
  }, [measure]);
  return offset;
}

/**
 * The current time, starting from the server's clock (so the first render matches the server HTML) and
 * ticking every `intervalMs` after hydration on this browser's clock plus `offsetMs` (useServerOffset).
 */
export function useNow(initialMs: number, intervalMs: number, offsetMs = 0): number {
  const [now, setNow] = useState(initialMs);
  useEffect(() => {
    setNow(Date.now() + offsetMs);
    const id = window.setInterval(() => setNow(Date.now() + offsetMs), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, offsetMs]);
  return now;
}
