// @vitest-environment node
// The real keyboard hook, on Windows only (the Windows CI job runs it inside pnpm check): Koffi loads
// from node_modules, user32 installs a WH_KEYBOARD_LL hook with the app's own hook procedure, and the
// hook comes out again. No key is injected; the procedure itself is covered in keyboard-hook.test.ts.
import { describe, expect, it, vi } from "vitest";
import { createKeyboardHook, HOOK_REINSTALL_MS } from "./keyboard-hook.ts";
import { loadWin32KeyboardHook } from "./keyboard-hook-win32.ts";

describe.runIf(process.platform === "win32")("the real keyboard hook on Windows", () => {
  it("installs a low-level keyboard hook and removes it", () => {
    const native = loadWin32KeyboardHook();
    try {
      const first = native.install();
      expect(typeof first).toBe("bigint");
      expect(first).not.toBe(0n);
      // Lockdown's reinstall: the second hook goes in before the first comes out.
      const second = native.install();
      expect(second).not.toBe(first);
      expect(native.remove(first)).toBe(true);
      expect(native.remove(second)).toBe(true);
      // A hook that is gone already cannot be removed twice.
      expect(native.remove(second)).toBe(false);
    } finally {
      native.dispose();
    }
  });

  it("runs lockdown's start, reinstall and stop against user32", () => {
    vi.useFakeTimers();
    const log = { info: vi.fn(), error: vi.fn() };
    const hook = createKeyboardHook({ load: loadWin32KeyboardHook, log });
    try {
      expect(hook.prepare()).toBe(true);
      hook.start();
      expect(hook.installed).toBe(true);
      vi.advanceTimersByTime(HOOK_REINSTALL_MS * 2);
      expect(hook.installed).toBe(true);
      hook.stop();
      expect(hook.installed).toBe(false);
      expect(log.error).not.toHaveBeenCalled();
    } finally {
      hook.dispose();
      vi.useRealTimers();
    }
  });
});
