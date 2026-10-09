// What the app watches during an exam ("Window states" and "System check on 1.2" in
// docs/phase-0-plan.md). In both modes a blocked app or screen-sharing tool that appears mid-exam sends
// tab.blocked with its name: the main process runs the 15 s process scan (window.uki.checks.watch) and
// reports only apps that appeared since its previous scan. In app exams the scan also looks for other
// browsers (C2), and focus leaving the locked window sends tab.blocked with app null, at most once per 5 s.
import { NO_BROWSERS, type ScanOptions, type UkiBridge } from "@uki/contracts";

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
  private unsubscribeScan: (() => void) | null = null;
  private unsubscribeBlur: (() => void) | null = null;
  private lastBlurAt = Number.NEGATIVE_INFINITY;

  constructor(options: ExamGuardOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  /** The process scan runs (both modes, from the exam's start until 3.1 or 2.1d). */
  get scanning(): boolean {
    return this.unsubscribeScan !== null;
  }

  /** Lost focus counts (app exams, while locked down). */
  get watchingFocus(): boolean {
    return this.unsubscribeBlur !== null;
  }

  /**
   * Starts or stops the 15 s process scan in the main process; `options` says whether it looks for
   * browsers too (in-app exams). A second start while scanning changes nothing.
   */
  scan(on: boolean, options: ScanOptions = NO_BROWSERS): void {
    const { bridge } = this.options;
    if (on === this.scanning) return;
    if (on) {
      this.unsubscribeScan = bridge.checks.onBlockedApps((apps) => {
        for (const app of apps) this.options.onBlocked(app.name);
      });
      void bridge.checks.watch(true, options).catch(() => {});
    } else {
      this.unsubscribeScan?.();
      this.unsubscribeScan = null;
      void bridge.checks.watch(false).catch(() => {});
    }
  }

  /** Starts or stops counting lost focus of the locked window. */
  watchFocus(on: boolean): void {
    if (on === this.watchingFocus) return;
    if (on) this.unsubscribeBlur = this.options.bridge.exam.onBlur(() => this.blur());
    else {
      this.unsubscribeBlur?.();
      this.unsubscribeBlur = null;
    }
  }

  stop(): void {
    this.scan(false);
    this.watchFocus(false);
  }

  blur(): void {
    const now = this.now();
    if (now - this.lastBlurAt < BLUR_THROTTLE_MS) return;
    this.lastBlurAt = now;
    this.options.onBlocked(null);
  }
}
