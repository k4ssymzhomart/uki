// packages/contracts/src/ipc.ts: every call is checked with Zod in the main process.
// The preload exposes one `window.uki` of type UkiBridge; each method maps to one IPC channel below.
import { z } from "zod";
import { BlockedApp } from "./blocked-apps.ts";
import { AppToLock, LockToApp, PairCode } from "./lock.ts";
import { UtcTimestamp } from "./primitives.ts";
import { DesktopOs } from "./session.ts";

export type { BlockedApp } from "./blocked-apps.ts";

export const AppInfo = z.object({ version: z.string(), os: DesktopOs, arch: z.string() });
export type AppInfo = z.infer<typeof AppInfo>;

/** Result of the 1.2 process and disk scan. */
export const ScanResult = z.object({
  apps: z.array(BlockedApp),
  screenShare: z.array(BlockedApp),
  freeMb: z.number().nonnegative(),
});
export type ScanResult = z.infer<typeof ScanResult>;

export const LockStatus = z.enum(["absent", "connected", "paired"]);
export type LockStatus = z.infer<typeof LockStatus>;

/** The code on the app's pairing card (E.3) while a Lock pairs; null once it is used, expired or the Lock left. */
export const LockPairCode = z.object({ code: PairCode, expires_at: UtcTimestamp });
export type LockPairCode = z.infer<typeof LockPairCode>;

export interface UkiBridge {
  app: { info(): Promise<{ version: string; os: "macos" | "windows"; arch: string }>; quit(): Promise<void> };
  checks: {
    scan(): Promise<{ apps: BlockedApp[]; screenShare: BlockedApp[]; freeMb: number }>;
    // Added in WP 0.6 (docs/decisions.md): the plan's bridge has no call for these three.
    cameraAccess(): Promise<boolean>; // macOS asks with systemPreferences.askForMediaAccess("camera"); true when granted
    watch(on: boolean): Promise<void>; // the 15 s process scan during the exam
    onBlockedApps(cb: (apps: BlockedApp[]) => void): () => void; // blocked apps that appeared since the previous scan
  };
  exam: {
    lockdown(on: boolean): Promise<void>; // kiosk, always on top, close and quit blocked
    hideToTray(on: boolean): Promise<void>; // browser exams
    onBlur(cb: () => void): () => void; // focus left the window during lockdown
  };
  lock: {
    status(): Promise<"absent" | "connected" | "paired">;
    send(msg: AppToLock): Promise<void>;
    onMessage(cb: (msg: LockToApp) => void): () => void;
    // Added in WP 0.6 (docs/decisions.md): the relay's status changes and the pairing card's code.
    onStatus(cb: (status: "absent" | "connected" | "paired") => void): () => void;
    onPairCode(cb: (code: LockPairCode | null) => void): () => void;
  };
  receipt: { savePdf(): Promise<string | null> }; // printToPDF of the receipt card, then a save dialog
  system: { openCameraSettings(): Promise<void> };
}

/** Channel names. Invoke channels use `ipcRenderer.invoke` / `ipcMain.handle`; event channels go main to renderer. */
export const IPC_CHANNELS = {
  appInfo: "uki:app:info",
  appQuit: "uki:app:quit",
  checksScan: "uki:checks:scan",
  checksCameraAccess: "uki:checks:camera-access",
  checksWatch: "uki:checks:watch",
  checksBlockedApps: "uki:checks:blocked-apps",
  examLockdown: "uki:exam:lockdown",
  examHideToTray: "uki:exam:hide-to-tray",
  examBlur: "uki:exam:blur",
  lockStatus: "uki:lock:status",
  lockSend: "uki:lock:send",
  lockMessage: "uki:lock:message",
  lockStatusChanged: "uki:lock:status-changed",
  lockPairCode: "uki:lock:pair-code",
  receiptSavePdf: "uki:receipt:save-pdf",
  systemOpenCameraSettings: "uki:system:open-camera-settings",
} as const;
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** Arguments (as a tuple) and result of every invoke channel. */
export const IPC_INVOKE = {
  [IPC_CHANNELS.appInfo]: { args: z.tuple([]), result: AppInfo },
  [IPC_CHANNELS.appQuit]: { args: z.tuple([]), result: z.void() },
  [IPC_CHANNELS.checksScan]: { args: z.tuple([]), result: ScanResult },
  [IPC_CHANNELS.checksCameraAccess]: { args: z.tuple([]), result: z.boolean() },
  [IPC_CHANNELS.checksWatch]: { args: z.tuple([z.boolean()]), result: z.void() },
  [IPC_CHANNELS.examLockdown]: { args: z.tuple([z.boolean()]), result: z.void() },
  [IPC_CHANNELS.examHideToTray]: { args: z.tuple([z.boolean()]), result: z.void() },
  [IPC_CHANNELS.lockStatus]: { args: z.tuple([]), result: LockStatus },
  [IPC_CHANNELS.lockSend]: { args: z.tuple([AppToLock]), result: z.void() },
  [IPC_CHANNELS.receiptSavePdf]: { args: z.tuple([]), result: z.string().nullable() },
  [IPC_CHANNELS.systemOpenCameraSettings]: { args: z.tuple([]), result: z.void() },
} as const;
export type IpcInvokeChannel = keyof typeof IPC_INVOKE;
export type IpcArgs<C extends IpcInvokeChannel> = z.infer<(typeof IPC_INVOKE)[C]["args"]>;
export type IpcResult<C extends IpcInvokeChannel> = z.infer<(typeof IPC_INVOKE)[C]["result"]>;

/** Payload (as a tuple of listener arguments) of every main-to-renderer event channel. */
export const IPC_EVENTS = {
  [IPC_CHANNELS.examBlur]: z.tuple([]),
  /** While watching: the blocked apps that appeared since the previous scan, at least one. */
  [IPC_CHANNELS.checksBlockedApps]: z.tuple([z.array(BlockedApp).min(1)]),
  [IPC_CHANNELS.lockMessage]: z.tuple([LockToApp]),
  [IPC_CHANNELS.lockStatusChanged]: z.tuple([LockStatus]),
  [IPC_CHANNELS.lockPairCode]: z.tuple([LockPairCode.nullable()]),
} as const;
export type IpcEventChannel = keyof typeof IPC_EVENTS;
export type IpcEventArgs<C extends IpcEventChannel> = z.infer<(typeof IPC_EVENTS)[C]>;

/** Checks the arguments of an invoke in the main process; throws a ZodError when they are wrong. */
export function parseIpcArgs<C extends IpcInvokeChannel>(channel: C, args: unknown[]): IpcArgs<C> {
  return IPC_INVOKE[channel].args.parse(args) as IpcArgs<C>;
}

/** Checks a handler's result before it crosses back to the renderer. */
export function parseIpcResult<C extends IpcInvokeChannel>(channel: C, result: unknown): IpcResult<C> {
  return IPC_INVOKE[channel].result.parse(result) as IpcResult<C>;
}

/** Checks an event's listener arguments in the preload before they reach the renderer. */
export function parseIpcEvent<C extends IpcEventChannel>(channel: C, args: unknown[]): IpcEventArgs<C> {
  return IPC_EVENTS[channel].parse(args) as IpcEventArgs<C>;
}
