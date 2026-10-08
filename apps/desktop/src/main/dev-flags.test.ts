// @vitest-environment node
import type { ScanResult } from "@uki/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  createScreenlessLockdown,
  describeDevFlags,
  hasDevEscape,
  NO_DEV_FLAGS,
  readDevFlags,
  withoutBlockedApps,
} from "./dev-flags.ts";

const ALL_ON = { UKI_USER_DATA_DIR: " /tmp/uki-e2e ", UKI_DEV_IGNORE_APPS: "1", UKI_DEV_NO_KIOSK: "true" };

describe("readDevFlags", () => {
  it("reads the three switches in a development build", () => {
    expect(readDevFlags(ALL_ON, false)).toEqual({
      userDataDir: "/tmp/uki-e2e",
      ignoreBlockedApps: true,
      noKiosk: true,
    });
    expect(describeDevFlags(readDevFlags(ALL_ON, false))).toEqual([
      "UKI_USER_DATA_DIR=/tmp/uki-e2e",
      "UKI_DEV_IGNORE_APPS",
      "UKI_DEV_NO_KIOSK",
    ]);
  });

  it("ignores every switch in a packaged build", () => {
    expect(readDevFlags(ALL_ON, true)).toEqual(NO_DEV_FLAGS);
  });

  it("is off by default and for other values", () => {
    expect(readDevFlags({}, false)).toEqual(NO_DEV_FLAGS);
    expect(
      readDevFlags({ UKI_DEV_IGNORE_APPS: "0", UKI_DEV_NO_KIOSK: "yes", UKI_USER_DATA_DIR: " " }, false),
    ).toEqual(NO_DEV_FLAGS);
    expect(describeDevFlags(NO_DEV_FLAGS)).toEqual([]);
  });
});

describe("withoutBlockedApps", () => {
  it("keeps free space and drops the apps", async () => {
    const telegram = { id: "telegram", name: "Telegram", kind: "app" } as const;
    const zoom = { id: "zoom", name: "Zoom", kind: "screen_share" } as const;
    const scan = vi.fn(
      async (): Promise<ScanResult> => ({ apps: [telegram], screenShare: [zoom], freeMb: 4096 }),
    );
    await expect(withoutBlockedApps(scan)()).resolves.toEqual({ apps: [], screenShare: [], freeMb: 4096 });
    expect(scan).toHaveBeenCalledOnce();
  });
});

describe("createScreenlessLockdown", () => {
  it("tracks the state that blocks quit, without a window", () => {
    const changes: boolean[] = [];
    const lockdown = createScreenlessLockdown((on) => changes.push(on));
    expect(lockdown.active).toBe(false);
    lockdown.set(true);
    lockdown.set(true);
    expect(lockdown.active).toBe(true);
    lockdown.set(false);
    expect(lockdown.active).toBe(false);
    expect(changes).toEqual([true, false]);
    const detach = lockdown.attach({} as never);
    expect(() => detach()).not.toThrow();
  });
});

describe("hasDevEscape", () => {
  it("keeps the escape in development builds and the lab zip only", () => {
    expect(hasDevEscape(false, "development")).toBe(true);
    expect(hasDevEscape(false, "e2e")).toBe(true);
    expect(hasDevEscape(true, "lab")).toBe(true);
    // The shipped zip, the installer and the MacBook's dmg.
    expect(hasDevEscape(true, "production")).toBe(false);
    expect(hasDevEscape(true, "e2e")).toBe(false);
  });
});
