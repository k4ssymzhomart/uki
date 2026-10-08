// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { type HookKey, LLKHF_ALTDOWN, SWALLOW_CANDIDATES, shouldSwallow, VK } from "./key-filter.ts";

/** A key event as WH_KEYBOARD_LL sees it, with the modifiers that are held. */
function press(vkCode: number, held: { alt?: boolean; ctrl?: boolean; shift?: boolean } = {}) {
  const key: HookKey = { vkCode, flags: held.alt ? LLKHF_ALTDOWN : 0 };
  const isDown = vi.fn((code: number) => {
    if (code === VK.CONTROL) return held.ctrl ?? false;
    if (code === VK.SHIFT) return held.shift ?? false;
    if (code === VK.MENU) return held.alt ?? false;
    return false;
  });
  return { swallowed: shouldSwallow(key, isDown), isDown };
}

const KEY_Q = 0x51;
const KEY_D = 0x44;
const KEY_L = 0x4c;
const F4 = 0x73;
const DELETE = 0x2e;
const PRINT_SCREEN = 0x2c;
const KEY_S = 0x53;
const APPS = 0x5d;

describe("the keys the hook swallows during lockdown", () => {
  it("swallows both Windows keys, alone and with any modifier", () => {
    for (const win of [VK.LWIN, VK.RWIN]) {
      expect(press(win).swallowed).toBe(true);
      expect(press(win, { alt: true }).swallowed).toBe(true);
      expect(press(win, { ctrl: true }).swallowed).toBe(true);
      expect(press(win, { shift: true }).swallowed).toBe(true);
    }
  });

  it("swallows Alt+Tab, also with Shift and with Ctrl", () => {
    expect(press(VK.TAB, { alt: true }).swallowed).toBe(true);
    expect(press(VK.TAB, { alt: true, shift: true }).swallowed).toBe(true);
    expect(press(VK.TAB, { alt: true, ctrl: true }).swallowed).toBe(true);
  });

  it("swallows Alt+Esc and Ctrl+Esc", () => {
    expect(press(VK.ESCAPE, { alt: true }).swallowed).toBe(true);
    expect(press(VK.ESCAPE, { ctrl: true }).swallowed).toBe(true);
  });

  it("has a rule for exactly the Windows keys, Tab and Esc", () => {
    expect([...SWALLOW_CANDIDATES].sort((a, b) => a - b)).toEqual([VK.TAB, VK.ESCAPE, VK.LWIN, VK.RWIN]);
  });
});

describe("the keys the hook lets through", () => {
  it("lets Ctrl+Shift+Q through: the lab zip's development escape is read in the window", () => {
    expect(press(KEY_Q, { ctrl: true, shift: true }).swallowed).toBe(false);
    expect(press(KEY_Q, { ctrl: true }).swallowed).toBe(false);
    expect(press(VK.CONTROL, { ctrl: true }).swallowed).toBe(false);
    expect(press(VK.SHIFT, { ctrl: true, shift: true }).swallowed).toBe(false);
  });

  it("lets Tab and Esc through without Alt or Ctrl, so the exam can use them", () => {
    expect(press(VK.TAB).swallowed).toBe(false);
    expect(press(VK.TAB, { shift: true }).swallowed).toBe(false);
    expect(press(VK.TAB, { ctrl: true }).swallowed).toBe(false);
    expect(press(VK.ESCAPE).swallowed).toBe(false);
    expect(press(VK.ESCAPE, { shift: true }).swallowed).toBe(false);
  });

  it("leaves Ctrl+Shift+Esc (Task Manager) to Windows, like Ctrl+Alt+Del", () => {
    expect(press(VK.ESCAPE, { ctrl: true, shift: true }).swallowed).toBe(false);
  });

  it("lets every other key through, with or without modifiers", () => {
    const others = [
      KEY_Q,
      KEY_D,
      KEY_L,
      KEY_S,
      F4,
      DELETE,
      PRINT_SCREEN,
      APPS,
      VK.MENU,
      VK.CONTROL,
      VK.SHIFT,
    ];
    for (const code of others) {
      for (const held of [{}, { alt: true }, { ctrl: true }, { shift: true }, { ctrl: true, alt: true }]) {
        expect(press(code, held).swallowed, `vk 0x${code.toString(16)} ${JSON.stringify(held)}`).toBe(false);
      }
    }
    // Byte range: no other virtual-key code has a rule.
    for (let code = 0; code <= 0xff; code += 1) {
      if (SWALLOW_CANDIDATES.includes(code)) continue;
      expect(press(code, { alt: true, ctrl: true }).swallowed).toBe(false);
    }
  });

  it("asks for the key state only for Esc, so every other key is a single lookup", () => {
    for (const code of [KEY_Q, VK.TAB, VK.LWIN, F4]) {
      expect(press(code, { alt: true, ctrl: true }).isDown).not.toHaveBeenCalled();
    }
    expect(press(VK.ESCAPE, { ctrl: true }).isDown).toHaveBeenCalled();
  });
});
