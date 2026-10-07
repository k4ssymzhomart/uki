// The renderer's side of Üki Lock ("Two exam modes", "Lock messages" and "What it enforces" in
// docs/phase-0-plan.md). The main process owns the socket and pairing; through window.uki.lock this
// module sends exam.state on every change and every 5 s, lock.start and lock.release, turns lock.started
// and exam.submitted into flow events, forwards the Lock's events to the outbox with source "lock",
// and sends lock.app_disconnected after the link has been down for 15 s while locked (the relay pushes
// status changes; a poll every 2 s backs it up).
import {
  type AppToLock,
  EXAM_STATE_INTERVAL_MS,
  LOCK_DISCONNECT_GRACE_MS,
  type LockEvent,
  type LockStatus,
  type LockToApp,
  type ReleaseReason,
  type UkiBridge,
} from "@uki/contracts";

type ExamState = Extract<AppToLock, { type: "exam.state" }>;

/** How often the link status is read while the browser is locked. */
export const LINK_POLL_MS = 2_000;

export interface LockLinkOptions {
  bridge: Pick<UkiBridge, "lock">;
  /** lock.started from the Lock (tabs it closed). */
  onStarted: (tabsClosed: number) => void;
  /** The exam tab reached lms_done_path (browser exams). */
  onSubmitted: () => void;
  /** tab.blocked, site.closed, copy.blocked or lock.fullscreen_exit, to queue with source "lock". */
  onEvent: (event: Exclude<LockEvent, { type: "exam.submitted" }>) => void;
  /** The link stayed down 15 s while locked: queue lock.app_disconnected { side: "lock" }. */
  onDisconnected: () => void;
  now?: () => number;
}

export class LockLink {
  private readonly options: LockLinkOptions;
  private readonly now: () => number;
  private unsubscribe: (() => void) | null = null;
  private stateTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private state: ExamState | null = null;
  private stateKey = "";
  /** The Lock holds the browser for this exam (lock.started seen, not released). */
  private locked = false;
  private downSince: number | null = null;
  private reportedOutage = false;

  constructor(options: LockLinkOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (this.unsubscribe) return;
    const unsubscribeMessages = this.options.bridge.lock.onMessage((message) => this.receive(message));
    const unsubscribeStatus = this.options.bridge.lock.onStatus((status) => this.linkStatus(status));
    this.unsubscribe = () => {
      unsubscribeMessages();
      unsubscribeStatus();
    };
    this.stateTimer = setInterval(() => this.sendState(), EXAM_STATE_INTERVAL_MS);
    this.pollTimer = setInterval(() => void this.poll(), LINK_POLL_MS);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.stateTimer !== null) clearInterval(this.stateTimer);
    if (this.pollTimer !== null) clearInterval(this.pollTimer);
    this.stateTimer = null;
    this.pollTimer = null;
  }

  get isLocked(): boolean {
    return this.locked;
  }

  /** The latest exam.state; sent at once when it changed. */
  update(state: ExamState): void {
    const key = JSON.stringify(state);
    this.state = state;
    if (key === this.stateKey) return;
    this.stateKey = key;
    this.sendState();
  }

  /** Exams in the app: lock the browser when 2.1 opens. */
  lockStart(): void {
    void this.send({ type: "lock.start" });
  }

  release(reason: ReleaseReason): void {
    this.locked = false;
    this.downSince = null;
    void this.send({ type: "lock.release", reason });
  }

  /** After an app restart while locked: the Lock is still locked to this exam. */
  markLocked(): void {
    this.locked = true;
  }

  receive(message: LockToApp): void {
    switch (message.type) {
      case "lock.started":
        this.locked = true;
        this.options.onStarted(message.tabs_closed);
        return;
      case "lock.released":
        this.locked = false;
        return;
      case "lock.event":
        if (message.event.type === "exam.submitted") this.options.onSubmitted();
        else this.options.onEvent(message.event);
        return;
      case "hello":
        // A (re)connected Lock learns the exam at once.
        this.sendState();
        return;
      default:
        return;
    }
  }

  private sendState(): void {
    if (this.state) void this.send(this.state);
  }

  private async send(message: AppToLock): Promise<void> {
    try {
      await this.options.bridge.lock.send(message);
    } catch {
      // No Lock connected: exam.state goes out again within 5 s, release and start on the next change.
    }
  }

  /** Watches the link while locked; 15 s down sends lock.app_disconnected once per outage. */
  async poll(): Promise<void> {
    if (!this.locked) {
      this.downSince = null;
      return;
    }
    let status: LockStatus = "absent";
    try {
      status = await this.options.bridge.lock.status();
    } catch {
      status = "absent";
    }
    this.linkStatus(status);
  }

  /** A link status from the relay (pushed or polled). */
  linkStatus(status: LockStatus): void {
    if (!this.locked) {
      this.downSince = null;
      return;
    }
    const now = this.now();
    if (status === "paired" || status === "connected") {
      this.downSince = null;
      this.reportedOutage = false;
      return;
    }
    this.downSince ??= now;
    if (!this.reportedOutage && now - this.downSince >= LOCK_DISCONNECT_GRACE_MS) {
      this.reportedOutage = true;
      this.options.onDisconnected();
    }
  }
}
