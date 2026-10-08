// The keyboard hook's life during exam lockdown ("Windows keys" in docs/phase-0-plan.md). Lockdown
// starts it and stops it (lockdown.ts); quitting and process exit stop it too (index.ts), and Windows
// removes it with the process if the app dies. While it runs it is installed again every 10 seconds,
// because Windows silently drops a low-level hook that once answers slower than 1 second: the new hook
// goes in before the old one comes out, so no key slips through in between. Platform-free: the native
// binding is passed in (keyboard-hook-win32.ts on Windows; the tests pass a fake).

/** Reinstall period while lockdown is on. */
export const HOOK_REINSTALL_MS = 10_000;

/** A handle from SetWindowsHookExW. */
export type HookHandle = bigint;

/** The native side: install and remove one low-level keyboard hook. */
export interface NativeKeyboardHook {
  /** Installs a hook and returns its handle; throws when Windows refuses. */
  install(): HookHandle;
  /** Removes a hook; false when Windows had already dropped it. */
  remove(handle: HookHandle): boolean;
  /** Releases the hook procedure; the binding cannot install again. */
  dispose(): void;
}

export interface KeyboardHookOptions {
  /** Loads the native binding; called once, on prepare() or the first start(). */
  load: () => NativeKeyboardHook;
  /** State changes and failures only. Never a key. */
  log: Pick<Console, "info" | "error">;
  reinstallMs?: number;
}

export interface KeyboardHook {
  /** True while a hook is installed (lockdown on). */
  readonly installed: boolean;
  /**
   * Loads the native binding without installing anything, so a packaging fault shows at launch rather
   * than at the exam's start. True when the binding is ready.
   */
  prepare(): boolean;
  /** Lockdown on: install the hook and reinstall it every HOOK_REINSTALL_MS. Idempotent. */
  start(): void;
  /** Lockdown off, quit or exit: remove the hook. Idempotent and never throws. */
  stop(): void;
  /** stop(), then release the binding. */
  dispose(): void;
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createKeyboardHook(options: KeyboardHookOptions): KeyboardHook {
  const { log } = options;
  const reinstallMs = options.reinstallMs ?? HOOK_REINSTALL_MS;
  let native: NativeKeyboardHook | null = null;
  let loadFailed = false;
  let handle: HookHandle | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  function binding(): NativeKeyboardHook | null {
    if (native !== null || loadFailed) return native;
    try {
      native = options.load();
      log.info("[desktop] keyboard hook ready");
    } catch (error) {
      // Lockdown goes on without the hook: the blur rule still brings the window back and logs.
      loadFailed = true;
      log.error(`[desktop] keyboard hook failed to load: ${message(error)}`);
    }
    return native;
  }

  function reinstall(current: NativeKeyboardHook): void {
    let next: HookHandle;
    try {
      next = current.install();
    } catch (error) {
      log.error(`[desktop] keyboard hook: reinstall failed: ${message(error)}`);
      return;
    }
    const previous = handle;
    handle = next;
    if (previous === null) {
      log.info("[desktop] keyboard hook on");
      return;
    }
    try {
      // False when Windows already dropped it for a slow answer; that is why this runs.
      current.remove(previous);
    } catch (error) {
      log.error(`[desktop] keyboard hook: remove failed: ${message(error)}`);
    }
  }

  function stop(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (handle === null || native === null) return;
    const removing = handle;
    handle = null;
    try {
      native.remove(removing);
      log.info("[desktop] keyboard hook off");
    } catch (error) {
      log.error(`[desktop] keyboard hook: remove failed: ${message(error)}`);
    }
  }

  return {
    get installed() {
      return handle !== null;
    },
    prepare: () => binding() !== null,
    start() {
      if (timer !== null) return;
      const current = binding();
      if (current === null) return;
      // Also the retry when this first install fails.
      timer = setInterval(() => reinstall(current), reinstallMs);
      try {
        handle = current.install();
        log.info("[desktop] keyboard hook on");
      } catch (error) {
        log.error(`[desktop] keyboard hook: install failed: ${message(error)}`);
      }
    },
    stop,
    dispose() {
      stop();
      native?.dispose();
      native = null;
    },
  };
}
