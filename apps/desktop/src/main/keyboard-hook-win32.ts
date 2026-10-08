// The Windows low-level keyboard hook ("Windows keys" in docs/phase-0-plan.md): SetWindowsHookExW with
// WH_KEYBOARD_LL, called through Koffi 3 (MIT) from the main process. Windows calls the hook procedure
// on the thread that installed it, here Electron's main thread, whose message loop runs it. The procedure
// reads the virtual-key code and the flags of each key event, asks key-filter.ts, and either swallows
// the event (returns 1) or hands it on with CallNextHookEx. It keeps nothing: no key is stored, logged
// or sent.
//
// Koffi is a native module, so it is loaded only here, only on Windows and only when asked
// (loadWin32KeyboardHook); macOS and Linux never load it. The main bundle leaves it out (a runtime
// require). The packaged Windows app carries it outside the asar, in resources/koffi/node_modules: the
// koffi loader and its Windows x64 binary, copied by electron-builder's win.extraResources.
import { createRequire } from "node:module";
import { join } from "node:path";
import { type IsKeyDown, shouldSwallow } from "./key-filter.ts";
import type { NativeKeyboardHook } from "./keyboard-hook.ts";

/** idHook for SetWindowsHookExW: a low-level keyboard hook (WinUser.h). */
export const WH_KEYBOARD_LL = 13;
/** nCode: the hook procedure may process the event; any other code goes straight on. */
export const HC_ACTION = 0;
/** GetAsyncKeyState: the most significant bit is set while the key is down. */
const KEY_DOWN_BIT = 0x8000;
/** KBDLLHOOKSTRUCT: DWORD vkCode at 0, DWORD scanCode at 4, DWORD flags at 8. */
const OFFSET_VK_CODE = 0;
const OFFSET_FLAGS = 8;

/** The part of Koffi this module uses; the real module satisfies it and the tests pass a fake. */
export interface KoffiApi {
  load(path: string): { func(convention: string, name: string, result: unknown, args: unknown[]): Native };
  proto(convention: string, name: null, result: unknown, args: unknown[]): unknown;
  pointer(type: unknown): unknown;
  register(callback: HookProc, type: unknown): bigint;
  unregister(callback: bigint): void;
  decode(value: unknown, offset: number, type: string): unknown;
}

// biome-ignore lint/suspicious/noExplicitAny: a foreign function takes and returns whatever its C prototype says
type Native = (...args: any[]) => any;
/** LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam); lParam is a pointer. */
export type HookProc = (nCode: number, wParam: number, lParam: bigint | null) => number | bigint;

/**
 * Binds user32 and kernel32 through Koffi and registers the hook procedure once. The binding installs
 * and removes hooks; it is used for the life of the process (lockdown reinstalls the hook every 10 s).
 */
export function bindWin32KeyboardHook(koffi: KoffiApi): NativeKeyboardHook {
  const user32 = koffi.load("user32.dll");
  const kernel32 = koffi.load("kernel32.dll");
  const stdcall = "__stdcall";

  // Anonymous types only: Koffi's type names are global, and a named type cannot be declared twice.
  const LowLevelKeyboardProc = koffi.proto(stdcall, null, "intptr", ["int", "uintptr", "void *"]);
  const SetWindowsHookExW = user32.func(stdcall, "SetWindowsHookExW", "void *", [
    "int",
    koffi.pointer(LowLevelKeyboardProc),
    "void *",
    "uint32",
  ]);
  const UnhookWindowsHookEx = user32.func(stdcall, "UnhookWindowsHookEx", "bool", ["void *"]);
  const CallNextHookEx = user32.func(stdcall, "CallNextHookEx", "intptr", [
    "void *",
    "int",
    "uintptr",
    "void *",
  ]);
  const GetAsyncKeyState = user32.func(stdcall, "GetAsyncKeyState", "int16", ["int"]);
  const GetModuleHandleW = kernel32.func(stdcall, "GetModuleHandleW", "void *", ["str16"]);

  const isDown: IsKeyDown = (vkCode) => (Number(GetAsyncKeyState(vkCode)) & KEY_DOWN_BIT) !== 0;

  // A table lookup and nothing else: Windows drops a hook that answers slower than 1 second.
  const proc: HookProc = (nCode, wParam, lParam) => {
    if (nCode === HC_ACTION && lParam !== null) {
      try {
        const vkCode = koffi.decode(lParam, OFFSET_VK_CODE, "uint32") as number;
        const flags = koffi.decode(lParam, OFFSET_FLAGS, "uint32") as number;
        if (shouldSwallow({ vkCode, flags }, isDown)) return 1;
      } catch {
        // Unreadable event: hand it on rather than lose a key.
      }
    }
    return CallNextHookEx(null, nCode, wParam, lParam);
  };
  let registered: bigint | null = koffi.register(proc, koffi.pointer(LowLevelKeyboardProc));
  // For a low-level hook the module is only a formality; the executable's own handle is always valid.
  const module: unknown = GetModuleHandleW(null);

  return {
    install() {
      if (registered === null) throw new Error("keyboard hook: the binding was disposed");
      const handle: unknown = SetWindowsHookExW(WH_KEYBOARD_LL, registered, module, 0);
      if (typeof handle !== "bigint" || handle === 0n) throw new Error("SetWindowsHookExW returned NULL");
      return handle;
    },
    remove(handle) {
      return Boolean(UnhookWindowsHookEx(handle));
    },
    dispose() {
      if (registered === null) return;
      koffi.unregister(registered);
      registered = null;
    },
  };
}

/** Where the packaged app keeps Koffi: resources/koffi/node_modules/koffi (electron-builder.yml). */
export const PACKAGED_KOFFI_DIR = "koffi";

/**
 * Koffi, loaded on first use. Windows only. A packaged app passes its resources folder
 * (process.resourcesPath); development builds and the tests take it from the app's node_modules.
 */
export function requireKoffi(resourcesPath: string | null = null): KoffiApi {
  if (process.platform !== "win32") throw new Error("keyboard hook: Koffi is loaded on Windows only");
  // createRequire resolves from the folder of the path it gets; the file itself need not exist.
  const from = resourcesPath === null ? import.meta.url : join(resourcesPath, PACKAGED_KOFFI_DIR, "load.cjs");
  // Typed as the real module, so the compiler checks that Koffi still fits KoffiApi.
  const koffi: typeof import("koffi") = createRequire(from)("koffi");
  return koffi;
}

/** The real binding: Koffi, user32 and kernel32. Throws when Koffi is missing or fails to load. */
export function loadWin32KeyboardHook(resourcesPath: string | null = null): NativeKeyboardHook {
  return bindWin32KeyboardHook(requireKoffi(resourcesPath));
}
