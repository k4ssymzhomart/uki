// What the app watches during an exam in the app ("Window states" and "System check on 1.2" in
// docs/phase-0-plan.md): focus leaving the locked window sends tab.blocked with app null at most once
// per 5 s, and a blocked app or screen-sharing tool that appears mid-exam sends tab.blocked with its
// name. The main process runs the 15 s process scan (window.uki.checks.watch) and reports only apps
// that appeared since its previous scan.
import type { UkiBridge } from "@uki/contracts";

/** At most one tab.blocked for a lost focus in this window. */
export const BLUR_THROTTLE_MS = 5_000;

export interface ExamGuardOptions {
  bridge: Pick<UkiBridge, "exam" | "checks">;
  /** Queue tab.blocked { app } (null when focus left the window). */
  onBlocked: (app: string | null) => void;
  now?: () => number;
}

export class ExamGuard {
  private readonly options: ExamGuardOptions;
  private readonly now: () => number;
  private unsubscribers: Array<() => void> = [];
  private lastBlurAt = Number.NEGATIVE_INFINITY;

  constructor(options: ExamGuardOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  get active(): boolean {
    return this.unsubscribers.length > 0;
  }

  start(): void {
    if (this.active) return;
    const { bridge } = this.options;
    this.unsubscribers = [
      bridge.exam.onBlur(() => this.blur()),
      bridge.checks.onBlockedApps((apps) => {
        for (const app of apps) this.options.onBlocked(app.name);
      }),
    ];
    void bridge.checks.watch(true).catch(() => {});
  }

  stop(): void {
    if (!this.active) return;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    void this.options.bridge.checks.watch(false).catch(() => {});
  }

  blur(): void {
    const now = this.now();
    if (now - this.lastBlurAt < BLUR_THROTTLE_MS) return;
    this.lastBlurAt = now;
    this.options.onBlocked(null);
  }
}
