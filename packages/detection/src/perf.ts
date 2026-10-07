// Face-tracking frame rate and the fallback from "Performance budget": if face tracking stays under
// 10 fps for 5 s, input drops to 480 × 360 and phone checks to one per second. The fallback stays on for
// the rest of the session so the rate does not flap. Pure: timestamps come in.
import { THRESHOLDS } from "@uki/contracts";

export interface InputSize {
  width: number;
  height: number;
}

/** getUserMedia size and the size frames reach the worker at ("Pipeline" step 1). */
export const FULL_INPUT: InputSize = { width: 640, height: 480 };
/** The fallback input size ("Performance budget"). */
export const DEGRADED_INPUT: InputSize = { width: 480, height: 360 };

/** fps is counted over this window. */
const FPS_WINDOW_MS = 1_000;

export interface PerfSample {
  /** Frames in the last second; null until a full second of frames exists. */
  fps: number | null;
  degraded: boolean;
  /** True on the one frame that switched to the fallback. */
  changed: boolean;
}

export interface PerfMonitor {
  frame(at: number): PerfSample;
  readonly fps: number | null;
  readonly degraded: boolean;
  readonly input: InputSize;
  readonly phoneIntervalMs: number;
}

export function createPerfMonitor(): PerfMonitor {
  const p = THRESHOLDS.performance;
  let times: number[] = [];
  let first: number | null = null;
  let lowSince: number | null = null;
  let degraded = false;
  let fps: number | null = null;

  return {
    frame(at) {
      first ??= at;
      times.push(at);
      times = times.filter((t) => t > at - FPS_WINDOW_MS);
      fps = at - first >= FPS_WINDOW_MS ? times.length : null;
      let changed = false;
      if (!degraded && fps !== null) {
        if (fps < p.lowFps) {
          lowSince ??= at;
          if (at - lowSince >= p.lowFpsWindowMs) {
            degraded = true;
            changed = true;
          }
        } else {
          lowSince = null;
        }
      }
      return { fps, degraded, changed };
    },
    get fps() {
      return fps;
    },
    get degraded() {
      return degraded;
    },
    get input() {
      return degraded ? DEGRADED_INPUT : FULL_INPUT;
    },
    get phoneIntervalMs() {
      return degraded ? p.lowFpsPhoneIntervalMs : THRESHOLDS.phone.intervalMs;
    },
  };
}
