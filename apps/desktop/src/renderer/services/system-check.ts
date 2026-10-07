// The rows of 1.2 ("System check on 1.2" in docs/phase-0-plan.md) that are not the camera: network
// (GET /auth/v1/health under 1,000 ms), browser lock (the relay's status), other apps and screen
// sharing (the main process's process scan), and storage (1 GB free). The camera row comes from the
// detection worker's camera check. Check again re-runs everything; the Lock status arrives as it
// changes (and is also polled), so pairing turns its row green without a click.
import { type LockStatus, THRESHOLDS, type UkiBridge } from "@uki/contracts";
import type { CameraCheck } from "@uki/detection";
import type { CheckRows } from "../flow/types.ts";
import type { CameraProblem } from "../flow/view-model.ts";

/** How often the Lock status is read while 1.2 is open. */
export const LOCK_POLL_MS = 2_000;

export interface SystemCheckOptions {
  health: () => Promise<number>;
  bridge: Pick<UkiBridge, "checks" | "lock">;
  onRows: (rows: Partial<CheckRows>) => void;
}

/** The camera row from the worker's camera check. */
export function cameraRow(check: CameraCheck): CheckRows["camera"] {
  return {
    status: check.ready ? "ready" : "fail",
    faces: check.faces,
    problem: check.problem as CameraProblem | null,
  };
}

/** The camera could not open at all. */
export const CAMERA_UNAVAILABLE: CheckRows["camera"] = { status: "fail", faces: null, problem: "no_camera" };

export function storageRow(freeMb: number): CheckRows["storage"] {
  return {
    status: freeMb >= THRESHOLDS.systemCheck.minFreeMb ? "ready" : "fail",
    freeGb: Math.floor((freeMb / 1024) * 10) / 10,
  };
}

export class SystemCheck {
  private readonly options: SystemCheckOptions;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private active = false;

  constructor(options: SystemCheckOptions) {
    this.options = options;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.unsubscribe = this.options.bridge.lock.onStatus((status) => this.emit({ lock: status }));
    void this.run();
    this.timer = setInterval(() => void this.lock(), LOCK_POLL_MS);
  }

  stop(): void {
    this.active = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Check again: every row once more. Resolves when all have answered. */
  async again(): Promise<void> {
    await this.run();
  }

  private async run(): Promise<void> {
    await Promise.all([this.network(), this.scan(), this.lock()]);
  }

  private async network(): Promise<void> {
    this.options.onRows({ network: { status: "checking", ms: null } });
    try {
      const ms = await this.options.health();
      this.emit({ network: { status: ms < THRESHOLDS.systemCheck.networkMaxMs ? "ready" : "fail", ms } });
    } catch {
      this.emit({ network: { status: "fail", ms: null } });
    }
  }

  private async scan(): Promise<void> {
    try {
      const result = await this.options.bridge.checks.scan();
      const app = result.apps[0]?.name ?? null;
      const share = result.screenShare[0]?.name ?? null;
      this.emit({
        apps: { status: app ? "fail" : "ready", app },
        screenShare: { status: share ? "fail" : "ready", app: share },
        storage: storageRow(result.freeMb),
      });
    } catch {
      this.emit({
        apps: { status: "fail", app: null },
        screenShare: { status: "fail", app: null },
        storage: { status: "fail", freeGb: null },
      });
    }
  }

  private async lock(): Promise<void> {
    let status: LockStatus = "absent";
    try {
      status = await this.options.bridge.lock.status();
    } catch {
      status = "absent";
    }
    this.emit({ lock: status });
  }

  private emit(rows: Partial<CheckRows>): void {
    if (this.active) this.options.onRows(rows);
  }
}
