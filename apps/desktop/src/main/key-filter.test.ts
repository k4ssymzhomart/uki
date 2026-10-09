// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { type HookKey, LLKHF_ALTDOWN, SWALLOW_CANDIDATES, shouldSwallow, VK } from "./key-filter.ts";

type Held = { alt?: boolean; altFlagOnly?: boolean; ctrl?: boolean; shift?: boolean };

/**
 * A key event as WH_KEYBOARD_LL sees it, with the modifiers that are held. `alt` sets both the event's
 * LLKHF_ALTDOWN flag and Alt's key state; `altFlagOnly` sets only the flag.
 */
function press(vkCode: number, held: Held = {}) {
  const flagged = held.alt === true || held.altFlagOnly === true;
  const key: HookKey = { vkCode, flags: flagged ? LLKHF_ALTDOWN : 0 };
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
const KEY_S = 0x53;
const KEY_A = 0x41;
const KEY_Z = 0x5a;
const F4 = 0x73;
const DELETE = 0x2e;
const APPS = 0x5d;
const NUMPAD0 = 0x60;
/** VK_C, VK_X and VK_V. */
const COPY_KEYS = [VK.KEY_C, VK.KEY_X, VK.KEY_V] as const;

const ALL_MODIFIERS: readonly Held[] = [
  {},
  { alt: true },
  { ctrl: true },
  { shift: true },
  { ctrl: true, shift: true },
  { ctrl: true, alt: true },
  { alt: true, shift: true },
  { ctrl: true, alt: true, shift: true },
];

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

  it("swallows Ctrl+C, Ctrl+X and Ctrl+V, also with Shift (Ctrl+Shift+V pastes as plain text)", () => {
    for (const code of COPY_KEYS) {
      const label = `vk 0x${code.toString(16)}`;
      expect(press(code, { ctrl: true }).swallowed, label).toBe(true);
      expect(press(code, { ctrl: true, shift: true }).swallowed, label).toBe(true);
    }
  });

  it("swallows Ctrl+Insert (copy) and Shift+Insert (paste), and both together", () => {
    expect(press(VK.INSERT, { ctrl: true }).swallowed).toBe(true);
    expect(press(VK.INSERT, { shift: true }).swallowed).toBe(true);
    expect(press(VK.INSERT, { ctrl: true, shift: true }).swallowed).toBe(true);
    expect(press(VK.INSERT, { alt: true, shift: true }).swallowed).toBe(true);
  });

  it("swallows PrtScn alone, with Alt, and with every other modifier", () => {
    expect(press(VK.SNAPSHOT).swallowed).toBe(true);
    expect(press(VK.SNAPSHOT, { alt: true }).swallowed).toBe(true);
    expect(press(VK.SNAPSHOT, { altFlagOnly: true }).swallowed).toBe(true);
    for (const held of ALL_MODIFIERS) {
      expect(press(VK.SNAPSHOT, held).swallowed, JSON.stringify(held)).toBe(true);
    }
  });

  it("has a rule for exactly the Windows keys, Tab, Esc, C, X, V, Insert and PrtScn", () => {
    expect([...SWALLOW_CANDIDATES].sort((a, b) => a - b)).toEqual([
      VK.TAB,
      VK.ESCAPE,
      VK.SNAPSHOT,
      VK.INSERT,
      VK.KEY_C,
      VK.KEY_V,
      VK.KEY_X,
      VK.LWIN,
      VK.RWIN,
    ]);
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

  it("lets C, X and V through as typing: alone, with Shift, and with AltGr (Ctrl+Alt)", () => {
    for (const code of COPY_KEYS) {
      const label = `vk 0x${code.toString(16)}`;
      expect(press(code).swallowed, label).toBe(false);
      expect(press(code, { shift: true }).swallowed, label).toBe(false);
      expect(press(code, { alt: true }).swallowed, label).toBe(false);
      // AltGr is Ctrl+Alt: AltGr+C types ć on the Polish layout, & on the Czech one.
      expect(press(code, { ctrl: true, alt: true }).swallowed, label).toBe(false);
      expect(press(code, { ctrl: true, alt: true, shift: true }).swallowed, label).toBe(false);
      // Alt counts from the event's flag alone too.
      expect(press(code, { ctrl: true, altFlagOnly: true }).swallowed, label).toBe(false);
    }
  });

  it("lets Insert through alone (overtype) and with Alt alone", () => {
    expect(press(VK.INSERT).swallowed).toBe(false);
    expect(press(VK.INSERT, { alt: true }).swallowed).toBe(false);
  });

  it("lets the other Ctrl shortcuts of a text field through: select all, undo", () => {
    for (const code of [KEY_A, KEY_Z]) {
      expect(press(code, { ctrl: true }).swallowed).toBe(false);
      expect(press(code, { ctrl: true, shift: true }).swallowed).toBe(false);
    }
  });

  it("lets every other key through, with or without modifiers", () => {
    const others = [KEY_Q, KEY_D, KEY_L, KEY_S, F4, DELETE, APPS, NUMPAD0, VK.MENU, VK.CONTROL, VK.SHIFT];
    for (const code of others) {
      for (const held of ALL_MODIFIERS) {
        expect(press(code, held).swallowed, `vk 0x${code.toString(16)} ${JSON.stringify(held)}`).toBe(false);
      }
    }
    // Byte range: no other virtual-key code has a rule.
    for (let code = 0; code <= 0xff; code += 1) {
      if (SWALLOW_CANDIDATES.includes(code)) continue;
      expect(press(code, { alt: true, ctrl: true, shift: true }).swallowed).toBe(false);
    }
  });
});

describe("what the filter asks and keeps", () => {
  it("asks for the key state only for Esc, C, X, V and Insert", () => {
    for (const code of [KEY_Q, VK.TAB, VK.LWIN, VK.RWIN, VK.SNAPSHOT, F4, DELETE]) {
      expect(
        press(code, { alt: true, ctrl: true }).isDown,
        `vk 0x${code.toString(16)}`,
      ).not.toHaveBeenCalled();
    }
    for (const code of [VK.ESCAPE, VK.INSERT, ...COPY_KEYS]) {
      expect(press(code, { ctrl: true }).isDown, `vk 0x${code.toString(16)}`).toHaveBeenCalled();
    }
  });

  it("asks only about Ctrl, Shift and Alt, never about another key", () => {
    const asked = new Set<number>();
    for (let code = 0; code <= 0xff; code += 1) {
      for (const held of ALL_MODIFIERS) {
        for (const [vk] of press(code, held).isDown.mock.calls) asked.add(vk);
      }
    }
    expect([...asked].sort((a, b) => a - b)).toEqual([VK.SHIFT, VK.CONTROL, VK.MENU]);
  });

  it("keeps nothing between events: the same event gets the same answer whatever came before", () => {
    // Ctrl+C, then C alone: the second answer depends only on the second event and the key state.
    expect(press(VK.KEY_C, { ctrl: true }).swallowed).toBe(true);
    expect(press(VK.KEY_C).swallowed).toBe(false);
    expect(press(VK.KEY_C, { ctrl: true }).swallowed).toBe(true);
    // A key-up (LLKHF_UP, 0x80) is read exactly like its key-down.
    const up = (vkCode: number, ctrl: boolean) =>
      shouldSwallow({ vkCode, flags: 0x80 }, (code) => ctrl && code === VK.CONTROL);
    expect(up(VK.KEY_V, true)).toBe(true);
    expect(up(VK.KEY_V, false)).toBe(false);
    expect(up(VK.SNAPSHOT, false)).toBe(true);
  });
});
