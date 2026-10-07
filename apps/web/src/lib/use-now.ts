"use client";

import { useEffect, useState } from "react";

/**
 * The current time, starting from the server's clock (so the first render matches the server HTML) and
 * ticking every `intervalMs` after hydration.
 */
export function useNow(initialMs: number, intervalMs: number): number {
  const [now, setNow] = useState(initialMs);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
