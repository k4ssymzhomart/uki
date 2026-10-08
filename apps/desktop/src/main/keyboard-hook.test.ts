// @vitest-environment node
// The keyboard hook with Koffi mocked: the life of the hook (install on lockdown, reinstall every 10 s,
// remove on stop) and the Win32 binding (what it asks of user32 and kernel32, and what its hook
// procedure answers). keyboard-hook.win32.test.ts installs the real hook on Windows.
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LLKHF_ALTDOWN, VK } from "./key-filter.ts";
import { createKeyboardHook, HOOK_REINSTALL_MS, type NativeKeyboardHook } from "./keyboard-hook.ts";
import {
  bindWin32KeyboardHook,
  HC_ACTION,
  type HookProc,
  type KoffiApi,
  requireKoffi,
  WH_KEYBOARD_LL,
} from "./keyboard-hook-win32.ts";

afterEach(() => {
  vi.useRealTimers();
});

const KEY_Q = 0x51;
const WM_KEYDOWN = 0x100;
const WM_SYSKEYDOWN = 0x104;

/** A native binding that hands out handles 1n, 2n, ... and records every call in order. */
function fakeNative(options: { failInstall?: () => boolean } = {}) {
  const calls: string[] = [];
  const live = new Set<bigint>();
  let next = 1n;
  const native: NativeKeyboardHook = {
    install: vi.fn(() => {
      if (options.failInstall?.()) {
        calls.push("install failed");
        throw new Error("SetWindowsHookExW returned NULL");
      }
      const handle = next;
      next += 1n;
      live.add(handle);
      calls.push(`install ${handle}`);
      return handle;
    }),
    remove: vi.fn((handle: bigint) => {
      calls.push(`remove ${handle}`);
      return live.delete(handle);
    }),
    dispose: vi.fn(() => {
      calls.push("dispose");
    }),
  };
  return { native, calls, live };
}

function quietLog() {
  return { info: vi.fn(), error: vi.fn() };
}

describe("the hook's life during lockdown", () => {
  it("installs on start and removes the same hook on stop, once each", () => {
    const { native, calls, live } = fakeNative();
    const load = vi.fn(() => native);
    const hook = createKeyboardHook({ load, log: quietLog() });
    expect(hook.installed).toBe(false);

    hook.start();
    hook.start();
    expect(hook.installed).toBe(true);
    expect(calls).toEqual(["install 1"]);

    hook.stop();
    hook.stop();
    expect(hook.installed).toBe(false);
    expect(calls).toEqual(["install 1", "remove 1"]);
    expect(live.size).toBe(0);
    expect(load).toHaveBeenCalledOnce();
  });

  it("installs again every 10 s, the new hook before the old one comes out", () => {
    vi.useFakeTimers();
    const { native, calls, live } = fakeNative();
    const hook = createKeyboardHook({ load: () => native, log: quietLog() });
    hook.start();
    vi.advanceTimersByTime(HOOK_REINSTALL_MS - 1);
    expect(calls).toEqual(["install 1"]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(["install 1", "install 2", "remove 1"]);
    vi.advanceTimersByTime(HOOK_REINSTALL_MS);
    expect(calls.slice(3)).toEqual(["install 3", "remove 2"]);
    expect([...live]).toEqual([3n]);

    hook.stop();
    expect(calls.at(-1)).toBe("remove 3");
    expect(live.size).toBe(0);
    // No reinstall after stop.
    vi.advanceTimersByTime(HOOK_REINSTALL_MS * 3);
    expect(calls.at(-1)).toBe("remove 3");
  });

  it("carries on when Windows already dropped the old hook for a slow answer", () => {
    vi.useFakeTimers();
    const { native, live } = fakeNative();
    const log = quietLog();
    const hook = createKeyboardHook({ load: () => native, log });
    hook.start();
    live.delete(1n); // Windows removed it silently.
    vi.advanceTimersByTime(HOOK_REINSTALL_MS);
    expect(hook.installed).toBe(true);
    expect([...live]).toEqual([2n]);
    expect(log.error).not.toHaveBeenCalled();
  });

  it("keeps trying every 10 s when Windows refuses the first install", () => {
    vi.useFakeTimers();
    let refuse = true;
    const { native, calls } = fakeNative({ failInstall: () => refuse });
    const log = quietLog();
    const hook = createKeyboardHook({ load: () => native, log });
    hook.start();
    expect(hook.installed).toBe(false);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("install failed"));
    refuse = false;
    vi.advanceTimersByTime(HOOK_REINSTALL_MS);
    expect(hook.installed).toBe(true);
    expect(calls).toEqual(["install failed", "install 1"]);
    hook.stop();
    expect(calls.at(-1)).toBe("remove 1");
  });

  it("keeps the old hook when a reinstall fails", () => {
    vi.useFakeTimers();
    let refuse = false;
    const { native, live } = fakeNative({ failInstall: () => refuse });
    const hook = createKeyboardHook({ load: () => native, log: quietLog() });
    hook.start();
    refuse = true;
    vi.advanceTimersByTime(HOOK_REINSTALL_MS);
    expect([...live]).toEqual([1n]);
    hook.stop();
    expect(live.size).toBe(0);
  });

  it("goes on without the hook when Koffi cannot load, and says so once", () => {
    const log = quietLog();
    const load = vi.fn((): NativeKeyboardHook => {
      throw new Error("Cannot find the native Koffi module; did you bundle it correctly?");
    });
    const hook = createKeyboardHook({ load, log });
    expect(hook.prepare()).toBe(false);
    expect(() => hook.start()).not.toThrow();
    expect(() => hook.stop()).not.toThrow();
    hook.start();
    expect(hook.installed).toBe(false);
    expect(load).toHaveBeenCalledOnce();
    expect(log.error).toHaveBeenCalledOnce();
    expect(log.error.mock.calls[0]?.[0]).toContain("Cannot find the native Koffi module");
  });

  it("prepare loads the binding without installing anything", () => {
    const { native, calls } = fakeNative();
    const log = quietLog();
    const hook = createKeyboardHook({ load: () => native, log });
    expect(hook.prepare()).toBe(true);
    expect(hook.prepare()).toBe(true);
    expect(calls).toEqual([]);
    expect(hook.installed).toBe(false);
    expect(log.info).toHaveBeenCalledWith("[desktop] keyboard hook ready");
  });

  it("dispose removes the hook, then releases the hook procedure", () => {
    const { native, calls } = fakeNative();
    const hook = createKeyboardHook({ load: () => native, log: quietLog() });
    hook.start();
    hook.dispose();
    expect(calls).toEqual(["install 1", "remove 1", "dispose"]);
  });

  it("never throws from stop, which runs on quit and on process exit", () => {
    const { native } = fakeNative();
    vi.mocked(native.remove).mockImplementation(() => {
      throw new Error("access violation");
    });
    const log = quietLog();
    const hook = createKeyboardHook({ load: () => native, log });
    hook.start();
    expect(() => hook.stop()).not.toThrow();
    expect(hook.installed).toBe(false);
  });

  it("logs state changes only", () => {
    vi.useFakeTimers();
    const { native } = fakeNative();
    const log = quietLog();
    const hook = createKeyboardHook({ load: () => native, log });
    hook.start();
    vi.advanceTimersByTime(HOOK_REINSTALL_MS * 2);
    hook.stop();
    expect(log.info.mock.calls.map(([line]) => line)).toEqual([
      "[desktop] keyboard hook ready",
      "[desktop] keyboard hook on",
      "[desktop] keyboard hook off",
    ]);
  });
});

/** Koffi stand-in: user32 and kernel32 functions as spies; lParam pointers index a table of key events. */
function fakeKoffi(options: { held?: Set<number>; hookHandle?: bigint | null } = {}) {
  const held = options.held ?? new Set<number>();
  const events = new Map<bigint, { vkCode: number; flags: number }>();
  const declared: string[] = [];
  let proc: HookProc | null = null;
  let procId: bigint | null = null;
  const fns = {
    SetWindowsHookExW: vi.fn((..._args: unknown[]) =>
      options.hookHandle === undefined ? 0x7700n : options.hookHandle,
    ),
    UnhookWindowsHookEx: vi.fn((..._args: unknown[]) => true),
    CallNextHookEx: vi.fn((..._args: unknown[]) => 0),
    GetAsyncKeyState: vi.fn((vk: number) => (held.has(vk) ? -32768 : 0)),
    GetModuleHandleW: vi.fn((..._args: unknown[]) => 0x400000n),
  };
  const koffi = {
    load: vi.fn((path: string) => ({
      func: (convention: string, name: string, _result: unknown, _args: unknown[]) => {
        declared.push(`${path} ${convention} ${name}`);
        const fn = fns[name as keyof typeof fns];
        if (!fn) throw new Error(`unexpected function ${name}`);
        return fn;
      },
    })),
    proto: vi.fn((..._args: unknown[]) => ({ kind: "LowLevelKeyboardProc" })),
    pointer: vi.fn((type: unknown) => ({ pointerTo: type })),
    register: vi.fn((callback: HookProc, _type: unknown) => {
      proc = callback;
      procId = 0xcafen;
      return procId;
    }),
    unregister: vi.fn(),
    decode: vi.fn((value: unknown, offset: number, type: string) => {
      const event = events.get(value as bigint);
      if (!event || type !== "uint32") throw new Error("bad pointer");
      if (offset === 0) return event.vkCode;
      if (offset === 8) return event.flags;
      throw new Error(`unexpected offset ${offset}`);
    }),
  } satisfies KoffiApi;

  let nextAddress = 0x1000n;
  return {
    koffi,
    fns,
    declared,
    /** Windows calling the hook procedure for one key event. */
    key(vkCode: number, flags = 0, wParam = WM_KEYDOWN, nCode = HC_ACTION) {
      if (proc === null) throw new Error("no hook procedure registered");
      const address = nextAddress;
      nextAddress += 0x20n;
      events.set(address, { vkCode, flags });
      fns.CallNextHookEx.mockClear();
      const result = proc(nCode, wParam, address);
      return { result, passedOn: fns.CallNextHookEx.mock.calls[0] ?? null, address };
    },
    get procId() {
      return procId;
    },
  };
}

describe("the Win32 binding (Koffi mocked)", () => {
  it("binds the five functions it needs with __stdcall and registers one hook procedure", () => {
    const fake = fakeKoffi();
    bindWin32KeyboardHook(fake.koffi);
    expect(fake.declared).toEqual([
      "user32.dll __stdcall SetWindowsHookExW",
      "user32.dll __stdcall UnhookWindowsHookEx",
      "user32.dll __stdcall CallNextHookEx",
      "user32.dll __stdcall GetAsyncKeyState",
      "kernel32.dll __stdcall GetModuleHandleW",
    ]);
    expect(fake.koffi.proto).toHaveBeenCalledWith("__stdcall", null, "intptr", ["int", "uintptr", "void *"]);
    expect(fake.koffi.register).toHaveBeenCalledOnce();
    expect(fake.fns.GetModuleHandleW).toHaveBeenCalledWith(null);
    // Nothing is installed until lockdown asks.
    expect(fake.fns.SetWindowsHookExW).not.toHaveBeenCalled();
  });

  it("installs a global WH_KEYBOARD_LL hook with the registered procedure and removes it by handle", () => {
    const fake = fakeKoffi();
    const native = bindWin32KeyboardHook(fake.koffi);
    const handle = native.install();
    expect(handle).toBe(0x7700n);
    expect(fake.fns.SetWindowsHookExW).toHaveBeenCalledWith(WH_KEYBOARD_LL, fake.procId, 0x400000n, 0);
    expect(native.remove(handle)).toBe(true);
    expect(fake.fns.UnhookWindowsHookEx).toHaveBeenCalledWith(0x7700n);
  });

  it("throws when Windows refuses the hook", () => {
    expect(() => bindWin32KeyboardHook(fakeKoffi({ hookHandle: null }).koffi).install()).toThrow(
      "SetWindowsHookExW returned NULL",
    );
    expect(() => bindWin32KeyboardHook(fakeKoffi({ hookHandle: 0n }).koffi).install()).toThrow();
  });

  it("removes every hook still installed before it releases the procedure", () => {
    const fake = fakeKoffi();
    const order: string[] = [];
    fake.fns.UnhookWindowsHookEx.mockImplementation((handle: unknown) => {
      order.push(`unhook ${String(handle)}`);
      return true;
    });
    fake.koffi.unregister.mockImplementation(() => order.push("unregister"));
    const native = bindWin32KeyboardHook(fake.koffi);
    const first = native.install();
    native.remove(first);
    order.length = 0;
    native.install();
    native.dispose();
    expect(order).toEqual(["unhook 30464", "unregister"]);
  });

  it("unregisters the procedure on dispose, once, and cannot install after", () => {
    const fake = fakeKoffi();
    const native = bindWin32KeyboardHook(fake.koffi);
    native.dispose();
    native.dispose();
    expect(fake.koffi.unregister).toHaveBeenCalledOnce();
    expect(fake.koffi.unregister).toHaveBeenCalledWith(0xcafen);
    expect(() => native.install()).toThrow("disposed");
  });

  it("swallows the Windows keys, Alt+Tab, Alt+Esc and Ctrl+Esc without passing them on", () => {
    const fake = fakeKoffi({ held: new Set([VK.CONTROL]) });
    bindWin32KeyboardHook(fake.koffi);
    for (const [vk, flags] of [
      [VK.LWIN, 0],
      [VK.RWIN, 0],
      [VK.TAB, LLKHF_ALTDOWN],
      [VK.ESCAPE, LLKHF_ALTDOWN],
      [VK.ESCAPE, 0], // Ctrl is held
    ] as const) {
      const { result, passedOn } = fake.key(vk, flags, WM_SYSKEYDOWN);
      expect(result, `vk 0x${vk.toString(16)}`).toBe(1);
      expect(passedOn).toBeNull();
    }
  });

  it("passes Ctrl+Shift+Q on to Windows unchanged, with the same arguments", () => {
    const fake = fakeKoffi({ held: new Set([VK.CONTROL, VK.SHIFT]) });
    bindWin32KeyboardHook(fake.koffi);
    const { result, passedOn, address } = fake.key(KEY_Q, 0, WM_KEYDOWN);
    expect(result).toBe(0);
    expect(passedOn).toEqual([null, HC_ACTION, WM_KEYDOWN, address]);
  });

  it("passes on events it may not process, and events it cannot read", () => {
    const fake = fakeKoffi();
    bindWin32KeyboardHook(fake.koffi);
    // nCode below zero: straight to CallNextHookEx, without reading the event.
    const negative = fake.key(VK.LWIN, 0, WM_KEYDOWN, -1);
    expect(negative.passedOn).not.toBeNull();
    expect(fake.koffi.decode).not.toHaveBeenCalled();
    // An unreadable pointer is passed on rather than lost.
    fake.koffi.decode.mockImplementationOnce(() => {
      throw new Error("bad pointer");
    });
    expect(fake.key(VK.LWIN).passedOn).not.toBeNull();
  });

  it("loads Koffi on Windows only", () => {
    if (process.platform === "win32") return;
    expect(() => requireKoffi()).toThrow("Windows only");
  });
});

/** The real module, with the two calls the test uses to play Windows. */
type RealKoffi = KoffiApi & {
  call(fn: bigint, type: unknown, ...args: unknown[]): unknown;
  address(value: unknown): bigint;
};

/** Real Koffi without user32: whatever this platform's Koffi package is, it marshals the procedure. */
function realKoffi(): RealKoffi | null {
  try {
    const koffi: typeof import("koffi") = createRequire(import.meta.url)("koffi");
    return koffi;
  } catch {
    return null;
  }
}

describe.runIf(realKoffi() !== null)("the hook procedure through real Koffi", () => {
  it("reads vkCode at offset 0 and flags at offset 8 of a real KBDLLHOOKSTRUCT", () => {
    const koffi = realKoffi();
    if (koffi === null) throw new Error("Koffi did not load");
    let procType: unknown = null;
    let procId: bigint | null = null;
    const callNext = vi.fn(() => 0);
    const stub = {
      ...koffi,
      load: () => ({
        func: (_convention: string, name: string) => {
          if (name === "SetWindowsHookExW")
            return (_id: number, lpfn: bigint) => {
              procId = lpfn;
              return 0x7700n;
            };
          if (name === "CallNextHookEx") return callNext;
          if (name === "GetAsyncKeyState") return (vk: number) => (vk === VK.CONTROL ? -32768 : 0);
          return () => 0x400000n;
        },
      }),
      proto: (...args: Parameters<KoffiApi["proto"]>) => {
        procType = koffi.proto(...args);
        return procType;
      },
      pointer: (type: unknown) => koffi.pointer(type),
      register: (callback: HookProc, type: unknown) => koffi.register(callback, type),
      unregister: (id: bigint) => koffi.unregister(id),
      decode: (value: unknown, offset: number, type: string) => koffi.decode(value, offset, type),
    } satisfies KoffiApi;
    const native = bindWin32KeyboardHook(stub);
    native.install();
    if (procId === null) throw new Error("SetWindowsHookExW got no procedure");

    // KBDLLHOOKSTRUCT { DWORD vkCode; DWORD scanCode; DWORD flags; DWORD time; ULONG_PTR dwExtraInfo; }
    const event = (vkCode: number, flags: number) => {
      const struct = Buffer.alloc(24);
      struct.writeUInt32LE(vkCode, 0);
      struct.writeUInt32LE(0x1c, 4);
      struct.writeUInt32LE(flags, 8);
      return { struct, pointer: koffi.address(struct) };
    };
    const lwin = event(VK.LWIN, 0);
    expect(Number(koffi.call(procId, procType, HC_ACTION, WM_KEYDOWN, lwin.pointer))).toBe(1);
    const altTab = event(VK.TAB, LLKHF_ALTDOWN);
    expect(Number(koffi.call(procId, procType, HC_ACTION, WM_SYSKEYDOWN, altTab.pointer))).toBe(1);
    const ctrlEsc = event(VK.ESCAPE, 0);
    expect(Number(koffi.call(procId, procType, HC_ACTION, WM_KEYDOWN, ctrlEsc.pointer))).toBe(1);
    expect(callNext).not.toHaveBeenCalled();
    const ctrlQ = event(KEY_Q, 0);
    expect(Number(koffi.call(procId, procType, HC_ACTION, WM_KEYDOWN, ctrlQ.pointer))).toBe(0);
    expect(callNext).toHaveBeenCalledOnce();
    native.dispose();
  });
});
