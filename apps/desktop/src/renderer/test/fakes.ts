// Stand-ins for window.uki, the student API and the detection runtime, for runtime tests.
import type {
  AppToLock,
  BlockedApp,
  CommandMessage,
  JoinExamOutput,
  LockPairCode,
  LockStatus,
  LockToApp,
  ScanOptions,
  SessionCommandRow,
  SubmitSessionOutput,
  UkiBridge,
} from "@uki/contracts";
import type { DetectionHandlers } from "@uki/detection";
import type { IdentityRunnerOptions } from "../detection/identity-runner.ts";
import type { DetectionRuntimeOptions, DetectionWantPhase } from "../detection/runtime.ts";
import type { DetectionLike, IdentityLike } from "../flow/runtime.ts";
import type { RealtimeStatus, StudentApi } from "../services/student-api.ts";
import { FakeServer } from "./fake-server.ts";
import { joinOutput } from "./flow-fixtures.ts";

export class FakeBridge implements UkiBridge {
  readonly calls: Array<[string, unknown]> = [];
  readonly lockSent: AppToLock[] = [];
  lockStatus: LockStatus = "paired";
  scanResult: { apps: BlockedApp[]; screenShare: BlockedApp[]; freeMb: number } = {
    apps: [],
    screenShare: [],
    freeMb: 50_000,
  };
  private blurListeners = new Set<() => void>();
  private lockListeners = new Set<(message: LockToApp) => void>();

  app = {
    info: async () => ({ version: "1.4.2", os: "macos" as const, arch: "arm64" }),
    quit: async () => {
      this.calls.push(["quit", null]);
    },
  };
  cameraGranted = true;
  watching = false;
  /** What each 1.2 scan and each watch start asked for, oldest first. */
  scanOptions: Array<ScanOptions | undefined> = [];
  watchOptions: Array<ScanOptions | undefined> = [];
  private blockedListeners = new Set<(apps: BlockedApp[]) => void>();
  private statusListeners = new Set<(status: LockStatus) => void>();
  private pairCodeListeners = new Set<(code: LockPairCode | null) => void>();

  checks = {
    // As the main process does: browsers only when asked for.
    scan: async (options?: ScanOptions) => {
      this.scanOptions.push(options);
      const asked = options?.browsers === true;
      return {
        ...this.scanResult,
        apps: this.scanResult.apps.filter((app) => asked || app.kind !== "browser"),
      };
    },
    cameraAccess: async () => this.cameraGranted,
    watch: async (on: boolean, options?: ScanOptions) => {
      this.watching = on;
      this.calls.push(["watch", on]);
      if (on) this.watchOptions.push(options);
    },
    onBlockedApps: (cb: (apps: BlockedApp[]) => void) => {
      this.blockedListeners.add(cb);
      return () => this.blockedListeners.delete(cb);
    },
  };
  exam = {
    lockdown: async (on: boolean) => {
      this.calls.push(["lockdown", on]);
    },
    hideToTray: async (on: boolean) => {
      this.calls.push(["hideToTray", on]);
    },
    onBlur: (cb: () => void) => {
      this.blurListeners.add(cb);
      return () => this.blurListeners.delete(cb);
    },
  };
  lock = {
    status: async () => this.lockStatus,
    send: async (message: AppToLock) => {
      this.lockSent.push(message);
    },
    onMessage: (cb: (message: LockToApp) => void) => {
      this.lockListeners.add(cb);
      return () => this.lockListeners.delete(cb);
    },
    onStatus: (cb: (status: LockStatus) => void) => {
      this.statusListeners.add(cb);
      return () => this.statusListeners.delete(cb);
    },
    onPairCode: (cb: (code: LockPairCode | null) => void) => {
      this.pairCodeListeners.add(cb);
      return () => this.pairCodeListeners.delete(cb);
    },
  };
  receipt = {
    savePdf: async () => {
      this.calls.push(["savePdf", null]);
      return "/tmp/receipt.pdf";
    },
  };
  system = {
    openCameraSettings: async () => {
      this.calls.push(["openCameraSettings", null]);
    },
  };

  blur(): void {
    for (const cb of this.blurListeners) cb();
  }

  fromLock(message: LockToApp): void {
    for (const cb of this.lockListeners) cb(message);
  }

  /** The main process's scan found blocked apps that appeared (while watching); browsers only when asked. */
  blocked(apps: BlockedApp[]): void {
    const asked = this.watchOptions.at(-1)?.browsers === true;
    const found = apps.filter((app) => asked || app.kind !== "browser");
    if (found.length === 0) return;
    for (const cb of this.blockedListeners) cb(found);
  }

  setLockStatus(status: LockStatus): void {
    this.lockStatus = status;
    for (const cb of this.statusListeners) cb(status);
  }

  pairCode(code: LockPairCode | null): void {
    for (const cb of this.pairCodeListeners) cb(code);
  }

  /** The last value passed to a call, e.g. last("lockdown"). */
  last(name: string): unknown {
    return this.calls.filter(([call]) => call === name).at(-1)?.[1];
  }
}

/** FakeServer plus the calls the flow makes outside the sync loop. */
export class FakeStudentApi extends FakeServer implements StudentApi {
  joinOutput: JoinExamOutput = joinOutput({ startsAt: Date.now() + 60_000, withQuestions: false });
  questionsAfterStart = true;
  commandRows: SessionCommandRow[] = [];
  acked = new Map<string, string>();
  submitted = 0;
  private commandHandler: ((command: CommandMessage) => void) | null = null;

  async joinExam(): Promise<JoinExamOutput> {
    if (!this.online) throw new Error("Failed to fetch");
    const exam = this.joinOutput.exam;
    this.endsAt = new Date(Date.parse(exam.starts_at) + exam.duration_min * 60_000).toISOString();
    const started = Date.parse(this.joinOutput.exam.starts_at) <= Date.now();
    return {
      ...this.joinOutput,
      questions: started && this.questionsAfterStart ? joinOutput({ withQuestions: true }).questions : null,
      server_time: new Date().toISOString(),
    };
  }

  async submitSession(): Promise<SubmitSessionOutput> {
    if (!this.online) throw new Error("Failed to fetch");
    this.submitted += 1;
    return { receipt_id: "UKI-204-0917-MT", time_used_s: 600, state: "submitted" };
  }

  async unackedCommands(): Promise<SessionCommandRow[]> {
    return this.commandRows.filter((row) => !this.acked.has(row.id));
  }

  async ackCommand(id: string, at: string): Promise<void> {
    this.acked.set(id, at);
  }

  async subscribeCommands(
    _sessionId: string,
    handlers: { onCommand(command: CommandMessage): void; onStatus(status: RealtimeStatus): void },
  ) {
    this.commandHandler = handlers.onCommand;
    queueMicrotask(() => handlers.onStatus("SUBSCRIBED"));
    return { close: () => {} };
  }

  async health(): Promise<number> {
    if (!this.online) throw new Error("Failed to fetch");
    return 38;
  }

  /** A proctor command arriving on session:{id}. */
  broadcast(command: CommandMessage): void {
    this.commandHandler?.(command);
  }
}

/** Detection without a camera: the test drives the handlers. */
export class FakeDetection implements DetectionLike {
  readonly phases: DetectionWantPhase[] = [];
  readonly stream = null;
  resumeResult = true;
  constructor(readonly options: DetectionRuntimeOptions) {}

  get handlers(): DetectionHandlers & { onStream?(stream: MediaStream | null): void } {
    return this.options.handlers;
  }

  async setPhase(phase: DetectionWantPhase): Promise<void> {
    this.phases.push(phase);
    if (phase === "check") {
      this.handlers.onCameraCheck?.({
        ready: true,
        faces: 1,
        brightness: 120,
        uniform: false,
        problem: null,
      });
    }
  }
  async retry(): Promise<void> {}
  async resume(): Promise<boolean> {
    return this.resumeResult;
  }
  dispose(): void {
    this.phases.push("off");
  }
}

/** The card match without Human: matches on the first try. */
export class FakeIdentity implements IdentityLike {
  constructor(readonly options: IdentityRunnerOptions) {}
  start(): void {
    this.options.onStatus("checking");
    queueMicrotask(() =>
      this.options.onVerdict({
        kind: "matched",
        score: 0.82,
        tries: 1,
        rows: { face: "ok", card: "ok", person: "ok" },
        event: { type: "identity.matched", data: { score: 0.82, tries: 1 } },
      }),
    );
  }
  async stop(): Promise<void> {}
}
