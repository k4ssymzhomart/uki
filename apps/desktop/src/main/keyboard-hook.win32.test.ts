// @vitest-environment node
// The real keyboard hook, on Windows only (the Windows CI job runs it inside pnpm check and again in its
// own step): Koffi loads from node_modules, user32 installs a WH_KEYBOARD_LL hook with the app's own hook
// procedure, and the hook comes out again. The last test plays the keyboard: it injects key events with
// SendInput, pumps this thread's messages so Windows can call the hook procedure (in the app, Electron's
// message loop does that), and checks which events the procedure swallowed. The test plays the keys; the
// hook itself never records or sends one.
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { VK } from "./key-filter.ts";
import { createKeyboardHook, HOOK_REINSTALL_MS } from "./keyboard-hook.ts";
import {
  bindWin32KeyboardHook,
  HC_ACTION,
  type KoffiApi,
  loadWin32KeyboardHook,
} from "./keyboard-hook-win32.ts";

const onWindows = process.platform === "win32";

describe.runIf(onWindows)("the real keyboard hook on Windows", () => {
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

// --- Playing the keyboard ------------------------------------------------------------------------------

/** INPUT.type for a keyboard event, and KEYBDINPUT.dwFlags (WinUser.h). */
const INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x1;
const KEYEVENTF_KEYUP = 0x2;
/** sizeof(INPUT) on x64: DWORD type, padding, then the 32-byte union; KEYBDINPUT starts at 8. */
const INPUT_SIZE = 40;
/** KBDLLHOOKSTRUCT.flags: injected, and key-up. */
const LLKHF_INJECTED = 0x10;
const LLKHF_UP = 0x80;
/** dwExtraInfo on every injected event, so the test reads only its own ("UKI-C1"). */
const TAG = 0x55_4b_49_2d_43_31n;
const PM_REMOVE = 1;
/** A key no app or shortcut uses: the hook must pass it on. */
const VK_F24 = 0x87;
/** The left- and right-hand modifier codes a low-level hook reports, read as the generic ones. */
const SIDED: ReadonlyMap<number, number> = new Map([
  [0xa0, VK.SHIFT],
  [0xa1, VK.SHIFT],
  [0xa2, VK.CONTROL],
  [0xa3, VK.CONTROL],
  [0xa4, VK.MENU],
  [0xa5, VK.MENU],
]);
const NAMES: ReadonlyMap<number, string> = new Map([
  [VK.CONTROL, "Ctrl"],
  [VK.SHIFT, "Shift"],
  [VK.MENU, "Alt"],
  [VK.KEY_C, "C"],
  [VK.KEY_X, "X"],
  [VK.KEY_V, "V"],
  [VK.INSERT, "Insert"],
  [VK.SNAPSHOT, "PrtScn"],
  [VK_F24, "F24"],
]);

/** One injected key event, and whether the hook should pass it on to the next hook. */
type Step = { vk: number; up: boolean; passes: boolean };
/** Keys the hook always passes on: the modifiers themselves, and F24. */
const PASSING = new Set<number>([VK.CONTROL, VK.SHIFT, VK.MENU, VK_F24]);
const event = (vk: number, isUp: boolean, passes = PASSING.has(vk)): Step => ({ vk, up: isUp, passes });
/** Hold `modifier`, press and release `key`, release `modifier`. */
const chord = (modifier: number, key: number): Step[] => [
  event(modifier, false),
  event(key, false),
  event(key, true),
  event(modifier, true),
];
const tap = (key: number, passes = PASSING.has(key)): Step[] => [
  event(key, false, passes),
  event(key, true, passes),
];

const label = (vk: number, isUp: boolean) =>
  `${NAMES.get(vk) ?? `0x${vk.toString(16)}`} ${isUp ? "up" : "down"}`;
const outcome = (passed: boolean) => (passed ? "passed" : "swallowed");

/** One line per step, as the hook should answer it. */
const expected = (steps: readonly Step[]): string[] =>
  steps.map((step) => `${label(step.vk, step.up)} ${outcome(step.passes)}`);

/** Real Koffi, seen through the binding's own interface (the compiler checks that it fits). */
function realKoffi(): KoffiApi {
  const koffi: typeof import("koffi") = createRequire(import.meta.url)("koffi");
  return koffi;
}

describe.runIf(onWindows && process.arch === "x64")("the real hook with real key events", () => {
  it("swallows Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+Insert, Shift+Insert, PrtScn and Alt+PrtScn", () => {
    const koffi = realKoffi();
    const user32 = koffi.load("user32.dll");
    const SendInput = user32.func("__stdcall", "SendInput", "uint32", ["uint32", "void *", "int"]);
    const PeekMessageW = user32.func("__stdcall", "PeekMessageW", "bool", [
      "void *",
      "void *",
      "uint32",
      "uint32",
      "uint32",
    ]);

    // What the hook procedure saw, in order: each tagged event, and whether it went on to the next hook.
    const seen: { vk: number; up: boolean; passed: boolean }[] = [];
    let current: { vk: number; up: boolean; passed: boolean } | null = null;
    const observed: KoffiApi = {
      load: (path) => {
        const lib = koffi.load(path);
        return {
          func: (convention, name, result, args) => {
            const fn = lib.func(convention, name, result, args);
            if (name !== "CallNextHookEx") return fn;
            return (...call: unknown[]) => {
              if (call[1] === HC_ACTION && current !== null) current.passed = true;
              return fn(...call);
            };
          },
        };
      },
      proto: (...args) => koffi.proto(...args),
      pointer: (type) => koffi.pointer(type),
      register: (callback, type) => koffi.register(callback, type),
      unregister: (id) => koffi.unregister(id),
      decode: (value, offset, type) => {
        // The procedure reads vkCode (offset 0) first: note the event if it is one of this test's.
        if (offset === 0) {
          current = null;
          const flags = Number(koffi.decode(value, 8, "uint32"));
          const extra = BigInt(koffi.decode(value, 16, "uint64") as number | bigint);
          if ((flags & LLKHF_INJECTED) !== 0 && extra === TAG) {
            const vk = Number(koffi.decode(value, 0, "uint32"));
            current = { vk: SIDED.get(vk) ?? vk, up: (flags & LLKHF_UP) !== 0, passed: false };
            seen.push(current);
          }
        }
        return koffi.decode(value, offset, type);
      },
    };

    /** Injects the steps, then pumps messages until the hook has answered each one (5 s at most). */
    function play(steps: readonly Step[]): string[] {
      const inputs = Buffer.alloc(INPUT_SIZE * steps.length);
      steps.forEach((step, index) => {
        const at = index * INPUT_SIZE;
        inputs.writeUInt32LE(INPUT_KEYBOARD, at);
        inputs.writeUInt16LE(step.vk, at + 8); // wVk
        const extended = step.vk === VK.INSERT ? KEYEVENTF_EXTENDEDKEY : 0;
        inputs.writeUInt32LE((step.up ? KEYEVENTF_KEYUP : 0) | extended, at + 12); // dwFlags
        inputs.writeBigUInt64LE(TAG, at + 24); // dwExtraInfo
      });
      const from = seen.length;
      const sent = Number(SendInput(steps.length, inputs, INPUT_SIZE));
      expect(sent, "SendInput was refused (no interactive input desktop?)").toBe(steps.length);
      const message = Buffer.alloc(64);
      const deadline = Date.now() + 5_000;
      while (seen.length - from < steps.length && Date.now() < deadline)
        PeekMessageW(message, null, 0, 0, PM_REMOVE);
      return seen.slice(from).map((key) => `${label(key.vk, key.up)} ${outcome(key.passed)}`);
    }

    const native = bindWin32KeyboardHook(observed);
    const handle = native.install();
    try {
      // First the keys that are harmless if they get through, then the rest once Ctrl+V proved the hook.
      const first = [...chord(VK.CONTROL, VK.KEY_V), ...tap(VK.SNAPSHOT, false), ...tap(VK_F24)];
      expect(play(first)).toEqual(expected(first));
      const rest = [
        ...chord(VK.CONTROL, VK.KEY_C),
        ...chord(VK.CONTROL, VK.KEY_X),
        ...chord(VK.CONTROL, VK.INSERT),
        ...chord(VK.SHIFT, VK.INSERT),
        ...chord(VK.MENU, VK.SNAPSHOT),
        // With Ctrl up again, C is typing and goes on: the hook read the key state, not a memory of it.
        ...tap(VK.KEY_C, true),
      ];
      expect(play(rest)).toEqual(expected(rest));
    } finally {
      native.remove(handle);
      native.dispose();
    }
  });
});
