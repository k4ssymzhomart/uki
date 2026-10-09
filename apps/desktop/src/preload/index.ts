// contextBridge: the one typed window.uki (UkiBridge from packages/contracts/src/ipc.ts). Each method
// invokes one IPC channel; the main process checks arguments and results with Zod, and this script checks
// every main-to-renderer event before it reaches the page. Built as CommonJS: sandboxed preloads cannot
// load ES modules, and they may require only "electron".
import {
  IPC_CHANNELS,
  type IpcArgs,
  type IpcEventArgs,
  type IpcEventChannel,
  type IpcInvokeChannel,
  type IpcResult,
  parseIpcEvent,
  type UkiBridge,
} from "@uki/contracts/ipc";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";

function invoke<C extends IpcInvokeChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<C>>;
}

/** Subscribes to a main-to-renderer event; drops payloads that fail the schema. Returns an unsubscribe. */
function subscribe<C extends IpcEventChannel>(
  channel: C,
  callback: (...args: IpcEventArgs<C>) => void,
): () => void {
  const listener = (_event: IpcRendererEvent, ...args: unknown[]) => {
    let parsed: IpcEventArgs<C>;
    try {
      parsed = parseIpcEvent(channel, args);
    } catch {
      return;
    }
    callback(...parsed);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const bridge: UkiBridge = {
  app: {
    info: () => invoke(IPC_CHANNELS.appInfo),
    quit: () => invoke(IPC_CHANNELS.appQuit),
  },
  checks: {
    // No trailing undefined: the main process would see an argument that is not a ScanOptions.
    scan: (options) => (options ? invoke(IPC_CHANNELS.checksScan, options) : invoke(IPC_CHANNELS.checksScan)),
    cameraAccess: () => invoke(IPC_CHANNELS.checksCameraAccess),
    watch: (on, options) =>
      options ? invoke(IPC_CHANNELS.checksWatch, on, options) : invoke(IPC_CHANNELS.checksWatch, on),
    onBlockedApps: (callback) => subscribe(IPC_CHANNELS.checksBlockedApps, (apps) => callback(apps)),
  },
  exam: {
    lockdown: (on) => invoke(IPC_CHANNELS.examLockdown, on),
    hideToTray: (on) => invoke(IPC_CHANNELS.examHideToTray, on),
    onBlur: (callback) => subscribe(IPC_CHANNELS.examBlur, () => callback()),
  },
  lock: {
    status: () => invoke(IPC_CHANNELS.lockStatus),
    send: (message) => invoke(IPC_CHANNELS.lockSend, message),
    onMessage: (callback) => subscribe(IPC_CHANNELS.lockMessage, (message) => callback(message)),
    onStatus: (callback) => subscribe(IPC_CHANNELS.lockStatusChanged, (status) => callback(status)),
    onPairCode: (callback) => subscribe(IPC_CHANNELS.lockPairCode, (code) => callback(code)),
  },
  receipt: {
    savePdf: () => invoke(IPC_CHANNELS.receiptSavePdf),
  },
  system: {
    openCameraSettings: () => invoke(IPC_CHANNELS.systemOpenCameraSettings),
  },
};

contextBridge.exposeInMainWorld("uki", bridge);
