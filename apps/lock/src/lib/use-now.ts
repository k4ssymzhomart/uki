import { useEffect, useState } from "react";

/** The current time, updated every `intervalMs` (the Lock bar's and popup's clocks). */
export function useNow(intervalMs = 1000, initial?: number): number {
  const [now, setNow] = useState(() => initial ?? Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
