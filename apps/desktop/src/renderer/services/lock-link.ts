// The renderer's side of Üki Lock ("Two exam modes", "Lock messages" and "What it enforces" in
// docs/phase-0-plan.md). The main process owns the socket and pairing; through window.uki.lock this
// module sends exam.state on every change and every 5 s, lock.start and lock.release, turns lock.started
// and exam.submitted into flow events, forwards the Lock's events to the outbox with source "lock",
// and sends lock.app_disconnected after the link has been down for 15 s while locked (the relay pushes
// status changes; a poll every 2 s backs it up). Down means no paired Lock, or not the install that
// sent lock.started: an unpaired Lock in another browser enforces nothing. The relay drops lock.start
// when no paired Lock is connected, so until lock.started comes back it is sent again whenever a paired
// Lock (re)connects.
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
  /**
   * The link stayed down 15 s while locked, or the Lock let go on its own clock (trigger deadline) while
   * this exam still held it: queue lock.app_disconnected { side: "lock" }.
   */
  onDisconnected: () => void;
  /** Server time minus the laptop's clock (the app's ClockOffset), sent with every exam.state. */
  clockOffsetMs?: () => number;
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
  /** exam.submitted ids already acted on: the Lock resends its events after every reconnect. */
  private readonly submittedIds = new Set<string>();
  /** The Lock holds the browser for this exam (lock.started seen, not released). */
  private locked = false;
  /** lock.start was sent and lock.started has not come back yet. */
  private startPending = false;
  private lastStatus: LockStatus | null = null;
  /** The install_id from the latest Lock hello (every Lock says hello when its link opens). */
  private linkInstall: string | null = null;
  /**
   * The install that sent lock.started. While locked only its link counts as up, so another browser's
   * Lock taking the relay's one slot reads as the link going away. Null when unknown (after an app
   * restart, or a hello this module missed): then any paired Lock counts.
   */
  private holder: string | null = null;
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

  /** Exams in the app: lock the browser when 2.1 opens (again on every Lock that connects until it does). */
  lockStart(): void {
    this.startPending = true;
    void this.send({ type: "lock.start" });
  }

  release(reason: ReleaseReason): void {
    this.locked = false;
    this.startPending = false;
    this.holder = null;
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
        this.startPending = false;
        this.holder = this.linkInstall;
        this.options.onStarted(message.tabs_closed);
        return;
      case "lock.released":
        // The Lock let go on its own clock while the exam still runs: the browser is free now.
        if (this.locked && message.trigger === "deadline") this.options.onDisconnected();
        this.locked = false;
        this.holder = null;
        return;
      case "lock.event":
        this.lockEvent(message);
        return;
      case "hello":
        // A (re)connected Lock learns the exam at once, and locks if the exam is waiting for it.
        this.linkInstall = message.install_id;
        this.sendState();
        this.resendStart();
        this.checkLink();
        return;
      default:
        return;
    }
  }

  /**
   * An event from the Lock. One the Lock filed under another exam is dropped. exam.submitted submits only
   * a browser exam the Lock holds, and only once per event id; a stale or resent one changes nothing.
   */
  private lockEvent(message: Extract<LockToApp, { type: "lock.event" }>): void {
    const exam = this.state?.exam;
    if (message.session_id !== undefined && message.session_id !== exam?.session_id) return;
    const { event } = message;
    if (event.type !== "exam.submitted") {
      this.options.onEvent(event);
      return;
    }
    if (!this.locked || exam?.mode !== "browser" || this.submittedIds.has(event.id)) return;
    this.submittedIds.add(event.id);
    this.options.onSubmitted();
  }

  /** exam.state with the clock offset, so the Lock reads the exam's server times right. */
  private sendState(): void {
    if (!this.state) return;
    const offset = this.options.clockOffsetMs?.();
    void this.send(offset === undefined ? this.state : { ...this.state, clock_offset_ms: offset });
  }

  private resendStart(): void {
    if (this.startPending && !this.locked) void this.send({ type: "lock.start" });
  }

  private async send(message: AppToLock): Promise<void> {
    try {
      await this.options.bridge.lock.send(message);
    } catch {
      // No Lock connected: exam.state goes out again within 5 s and lock.start when a paired Lock
      // connects; the Lock releases itself when the exam.state it gets says done.
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
    // A Lock paired just now (pair.ok sends no hello to the app).
    const pairedNow = status === "paired" && this.lastStatus !== "paired";
    this.lastStatus = status;
    if (pairedNow) this.resendStart();
    this.checkLink();
  }

  /**
   * While locked the link is up only when the Lock that holds the browser is paired and connected.
   * "connected" is a Lock that is not paired (another browser's install, say): it gets no exam and
   * enforces nothing, so it counts as down.
   */
  private linkUp(): boolean {
    if (this.lastStatus !== "paired") return false;
    return this.holder === null || this.linkInstall === this.holder;
  }

  private checkLink(): void {
    if (!this.locked) {
      this.downSince = null;
      return;
    }
    const now = this.now();
    if (this.linkUp()) {
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
