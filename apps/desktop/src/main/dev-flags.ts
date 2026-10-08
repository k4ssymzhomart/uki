// Development-only switches for running the app on a developer's laptop and in the end-to-end test
// (apps/desktop/test/e2e.spec.ts). A packaged build ignores every one of them, like UKI_ALLOW_CAPTURE.
//
//   UKI_USER_DATA_DIR=/tmp/x     a separate userData folder: its own outbox, anonymous student, Lock
//                                pairing and single-instance lock, so a test run starts clean
//   UKI_DEV_IGNORE_APPS=1        the process scan reports no blocked apps (the 1.2 rows and the exam
//                                watch), for a laptop that runs Telegram or Claude while developing
//   UKI_DEV_NO_KIOSK=1           exam.lockdown keeps its state (quit and close stay blocked) but never
//                                takes the screen: no kiosk, no always-on-top, no focus stealing
import type { ScanResult } from "@uki/contracts";
import type { Lockdown } from "./lockdown.ts";

export interface DevFlags {
  userDataDir: string | null;
  ignoreBlockedApps: boolean;
  noKiosk: boolean;
}

export const NO_DEV_FLAGS: DevFlags = { userDataDir: null, ignoreBlockedApps: false, noKiosk: false };

const isOn = (value: string | undefined): boolean => value === "1" || value === "true";

/** The flags from the environment; none at all in a packaged build. */
export function readDevFlags(env: Record<string, string | undefined>, isPackaged: boolean): DevFlags {
  if (isPackaged) return NO_DEV_FLAGS;
  const dir = env.UKI_USER_DATA_DIR?.trim();
  return {
    userDataDir: dir ? dir : null,
    ignoreBlockedApps: isOn(env.UKI_DEV_IGNORE_APPS),
    noKiosk: isOn(env.UKI_DEV_NO_KIOSK),
  };
}

/**
 * The development escape (Cmd/Ctrl+Shift+Q leaves lockdown, lockdown.ts): development builds and the lab
 * and smoke zips (`electron-vite build --mode lab` or `--mode smoke`) only. Every other packaged build
 * keeps none, the MacBook's Demo Day build included; a proctor's End session releases it.
 */
export function hasDevEscape(isPackaged: boolean, mode: string): boolean {
  return !isPackaged || mode === "lab" || mode === "smoke";
}

/** Names the flags that are on, for one loud line in the main process log. */
export function describeDevFlags(flags: DevFlags): string[] {
  const on: string[] = [];
  if (flags.userDataDir) on.push(`UKI_USER_DATA_DIR=${flags.userDataDir}`);
  if (flags.ignoreBlockedApps) on.push("UKI_DEV_IGNORE_APPS");
  if (flags.noKiosk) on.push("UKI_DEV_NO_KIOSK");
  return on;
}

/** A scan with the blocked apps and screen-sharing tools left out (UKI_DEV_IGNORE_APPS). */
export function withoutBlockedApps(scan: () => Promise<ScanResult>): () => Promise<ScanResult> {
  return async () => ({ ...(await scan()), apps: [], screenShare: [] });
}

/** Lockdown without the window calls (UKI_DEV_NO_KIOSK): `active` still blocks close and quit. */
export function createScreenlessLockdown(onChange?: (on: boolean) => void): Lockdown {
  let active = false;
  return {
    get active() {
      return active;
    },
    set(on) {
      if (on === active) return;
      active = on;
      onChange?.(on);
    },
    attach: () => () => {},
  };
}
