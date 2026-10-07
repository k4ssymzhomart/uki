// The app's side of Üki Lock behind window.uki.lock ("Pairing (E.3)" in docs/phase-0-plan.md): the
// WebSocket relay of lock-relay.ts (owned by the Lock work package), its pairing stored in userData, and
// the student's name for the Lock popup. The renderer sends `hello` through lock.send() once it knows the
// student; the main process keeps the name for every later Lock hello and fills in its own app version,
// OS and pairing state before the hello goes out.
import type { AppToLock, DesktopOs, LockPairCode, LockStatus, LockToApp } from "@uki/contracts";
import {
  createFilePairingStore,
  createLockRelay,
  type LockRelay,
  type LockRelayLog,
  type LockRelayOptions,
  resolveLockOrigin,
} from "./lock-relay.ts";

export interface LockLink {
  status(): LockStatus;
  send(message: AppToLock): void;
  close(): Promise<void>;
}

export type LockLinkOptions = {
  /** VITE_LOCK_EXTENSION_ID. Unset: development builds accept any extension, packaged builds none. */
  extensionId: string | undefined;
  dev: boolean;
  appVersion: string;
  os: DesktopOs;
  /** A JSON file in userData that remembers the paired Lock install. */
  pairingFile: string;
  onMessage: (message: LockToApp) => void;
  onStatus: (status: LockStatus) => void;
  onPairCode: (code: LockPairCode | null) => void;
  /** Defaults to the console. */
  log?: LockRelayLog;
  /** Tests pass a fake relay. */
  createRelay?: (options: LockRelayOptions) => Pick<LockRelay, "status" | "send" | "close">;
};

export function startLockLink(options: LockLinkOptions): LockLink {
  let studentName: string | null = null;
  const relay = (options.createRelay ?? createLockRelay)({
    allowedOrigin: resolveLockOrigin(options.extensionId, {
      dev: options.dev,
      ...(options.log ? { log: options.log } : {}),
    }),
    appInfo: () => ({ app_version: options.appVersion, os: options.os, student_name: studentName }),
    onMessage: options.onMessage,
    onStatus: options.onStatus,
    onPairCode: options.onPairCode,
    store: createFilePairingStore(options.pairingFile),
    ...(options.log ? { log: options.log } : {}),
  });

  return {
    status: () => relay.status(),
    send(message) {
      if (message.type === "hello") {
        studentName = message.student_name;
        relay.send({
          ...message,
          app_version: options.appVersion,
          os: options.os,
          paired: relay.status() === "paired",
        });
        return;
      }
      relay.send(message);
    },
    close: () => relay.close(),
  };
}
