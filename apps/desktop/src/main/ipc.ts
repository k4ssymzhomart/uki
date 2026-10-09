// Zod-checked handlers behind window.uki. Every channel, its arguments and its result are declared in
// packages/contracts/src/ipc.ts; this file checks the sender, the arguments and the result of each call,
// and maps each channel to lockdown.ts, tray.ts, scan.ts, the Lock relay, receipt-pdf.ts and
// camera-access.ts (wired in index.ts).
import {
  type AppToLock,
  type DesktopOs,
  IPC_CHANNELS,
  IPC_EVENTS,
  IPC_INVOKE,
  type IpcArgs,
  type IpcEventArgs,
  type IpcEventChannel,
  type IpcInvokeChannel,
  type IpcResult,
  type LockStatus,
  NO_BROWSERS,
  parseIpcArgs,
  parseIpcResult,
  type ScanOptions,
  type ScanResult,
  type WatchLabel,
} from "@uki/contracts";
import type { Locale } from "@uki/i18n";

/** One implementation per invoke channel; arguments arrive parsed, the result is parsed on the way out. */
export type IpcHandlers = {
  [C in IpcInvokeChannel]: (...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>;
};

/** The parts of Electron's ipcMain this module uses, so tests can pass a fake. */
export interface IpcMainLike {
  handle(channel: string, listener: (event: IpcInvokeEventLike, ...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}
export interface IpcInvokeEventLike {
  readonly senderFrame: { readonly url: string } | null;
}
export interface WebContentsLike {
  send(channel: string, ...args: unknown[]): void;
}

async function invoke<C extends IpcInvokeChannel>(
  channel: C,
  handlers: IpcHandlers,
  event: IpcInvokeEventLike,
  args: unknown[],
  isTrustedSender: (url: string) => boolean,
): Promise<IpcResult<C>> {
  const url = event.senderFrame?.url;
  if (url === undefined || !isTrustedSender(url))
    throw new Error(`${channel}: refused, the sender is not the app`);
  const parsed = parseIpcArgs(channel, args);
  const handler = handlers[channel] as (...input: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>;
  return parseIpcResult(channel, await handler(...parsed));
}

/**
 * Registers every invoke channel of the contract. A call from a frame outside the app, with arguments
 * that fail the schema, or with a result that fails it, rejects in the renderer. Returns an unregister.
 */
export function registerIpcHandlers(
  ipc: IpcMainLike,
  handlers: IpcHandlers,
  isTrustedSender: (url: string) => boolean,
): () => void {
  const channels = Object.keys(IPC_INVOKE) as IpcInvokeChannel[];
  for (const channel of channels) {
    ipc.handle(channel, (event, ...args) => invoke(channel, handlers, event, args, isTrustedSender));
  }
  return () => {
    for (const channel of channels) ipc.removeHandler(channel);
  };
}

/** Sends a main-to-renderer event (exam blur, Lock messages) after checking its payload. */
export function sendToRenderer<C extends IpcEventChannel>(
  contents: WebContentsLike,
  channel: C,
  ...args: IpcEventArgs<C>
): void {
  contents.send(channel, ...IPC_EVENTS[channel].parse(args));
}

export function desktopOs(platform: NodeJS.Platform): DesktopOs {
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  throw new Error(`Üki runs on macOS and Windows, not ${platform}`);
}

/** The system settings page for camera access. */
export function cameraSettingsUrl(os: DesktopOs): string {
  return os === "macos"
    ? "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"
    : "ms-settings:privacy-webcam";
}

/** What the handlers drive; index.ts passes the real modules, tests pass fakes. */
export type HandlerDeps = {
  info: { version: string; os: DesktopOs; arch: string };
  /** app.quit(); refused while the exam holds the app (lockdown, the tray or the exam's scan). */
  quit: () => void;
  examActive: () => boolean;
  /** The 1.2 scan; browsers too when the renderer asks (in-app exams). */
  scan: (options: ScanOptions) => Promise<ScanResult>;
  cameraAccess: () => Promise<boolean>;
  watcher: { start(options: ScanOptions): void; stop(): void };
  lockdown: { set(on: boolean): void };
  trayMode: {
    set(on: boolean): Promise<void>;
    setExamState(state: { watch: WatchLabel; locale: Locale }): void;
  };
  lock: { status(): LockStatus; send(message: AppToLock): void };
  savePdf: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
};

export function createIpcHandlers(deps: HandlerDeps): IpcHandlers {
  return {
    [IPC_CHANNELS.appInfo]: () => deps.info,
    [IPC_CHANNELS.appQuit]: () => {
      if (deps.examActive()) throw new Error(`${IPC_CHANNELS.appQuit}: refused while the exam runs`);
      deps.quit();
    },
    [IPC_CHANNELS.checksScan]: (options) => deps.scan(options ?? NO_BROWSERS),
    [IPC_CHANNELS.checksCameraAccess]: () => deps.cameraAccess(),
    [IPC_CHANNELS.checksWatch]: (on, options) => {
      if (on) deps.watcher.start(options ?? NO_BROWSERS);
      else deps.watcher.stop();
    },
    [IPC_CHANNELS.examLockdown]: (on) => deps.lockdown.set(on),
    [IPC_CHANNELS.examHideToTray]: (on) => deps.trayMode.set(on),
    [IPC_CHANNELS.lockStatus]: () => deps.lock.status(),
    [IPC_CHANNELS.lockSend]: (message) => {
      // The tray shows the same watch label as the Lock bar, in the student's language.
      if (message.type === "exam.state") {
        deps.trayMode.setExamState({ watch: message.watch, locale: message.locale });
      }
      deps.lock.send(message);
    },
    [IPC_CHANNELS.receiptSavePdf]: () => deps.savePdf(),
    [IPC_CHANNELS.systemOpenCameraSettings]: () => deps.openExternal(cameraSettingsUrl(deps.info.os)),
  };
}
