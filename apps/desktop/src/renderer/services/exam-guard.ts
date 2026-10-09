// What the app watches during an exam ("Window states" and "System check on 1.2" in
// docs/phase-0-plan.md). In both modes a blocked app or screen-sharing tool that appears mid-exam sends
// tab.blocked with its name: the main process runs the 15 s process scan (window.uki.checks.watch) and
// reports only apps that appeared since its previous scan. In app exams, focus leaving the locked
// window also sends tab.blocked with app null, at most once per 5 s, and the window cancels copy, cut,
// paste, the context menu and drop while locked (clipboard-guard.ts; C1 in docs/finals-plan.md).
import type { UkiBridge } from "@uki/contracts";
import { type GuardTarget, guardClipboard } from "./clipboard-guard.ts";

/** At most one tab.blocked for a lost focus in this window. */
export const BLUR_THROTTLE_MS = 5_000;

export interface ExamGuardOptions {
  bridge: Pick<UkiBridge, "exam" | "checks">;
  /** Queue tab.blocked { app } (null when focus left the window). */
  onBlocked: (app: string | null) => void;
  now?: () => number;
  /** Where copy and paste are cancelled while locked; the renderer's window by default. */
  page?: GuardTarget | null;
}

export class ExamGuard {
  private readonly options: ExamGuardOptions;
  private readonly now: () => number;
  private unsubscribeScan: (() => void) | null = null;
  private unsubscribeBlur: (() => void) | null = null;
  private releaseClipboard: (() => void) | null = null;
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

  /** Copy, cut, paste, the context menu and drop are cancelled (app exams, while locked down). */
  get blockingClipboard(): boolean {
    return this.releaseClipboard !== null;
  }

  /** Starts or stops the 15 s process scan in the main process. */
  scan(on: boolean): void {
    const { bridge } = this.options;
    if (on === this.scanning) return;
    if (on) {
      this.unsubscribeScan = bridge.checks.onBlockedApps((apps) => {
        for (const app of apps) this.options.onBlocked(app.name);
      });
      void bridge.checks.watch(true).catch(() => {});
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

  /** Starts or stops cancelling copy, cut, paste, the context menu and drop in this window. */
  blockClipboard(on: boolean): void {
    if (on === this.blockingClipboard) return;
    if (on) {
      const page = this.options.page === undefined ? defaultPage() : this.options.page;
      if (page) this.releaseClipboard = guardClipboard(page);
    } else {
      this.releaseClipboard?.();
      this.releaseClipboard = null;
    }
  }

  stop(): void {
    this.scan(false);
    this.watchFocus(false);
    this.blockClipboard(false);
  }

  blur(): void {
    const now = this.now();
    if (now - this.lastBlurAt < BLUR_THROTTLE_MS) return;
    this.lastBlurAt = now;
    this.options.onBlocked(null);
  }
}

function defaultPage(): GuardTarget | null {
  return typeof window === "undefined" ? null : window;
}
