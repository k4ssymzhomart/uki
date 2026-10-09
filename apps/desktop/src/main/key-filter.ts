// The keys the Windows keyboard hook swallows during exam lockdown: "Windows keys" in
// docs/phase-0-plan.md (the Windows keys, Alt+Tab, Alt+Esc and Ctrl+Esc) and C1 in docs/finals-plan.md
// (Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+Insert, Shift+Insert and PrtScn), and nothing more. Pure, so the list is
// tested without Windows. The hook (keyboard-hook-win32.ts) calls `shouldSwallow` for every key event
// while it is installed; the answer is a lookup by virtual-key code, plus, for C, X, V, Insert and Esc,
// a question to Windows about the modifiers held right now (GetAsyncKeyState). It keeps nothing: no key,
// no modifier and no earlier event is remembered between calls.
//
// Left with Windows on purpose: Ctrl+Alt+Del and Win+L (no hook can stop them), Ctrl+Shift+Esc (Task
// Manager, as reachable through Ctrl+Alt+Del), and Ctrl+Shift+Q, the lab zip's development escape, which
// lockdown.ts reads in the window. Alt+F4 reaches the window and is refused there: close is blocked.
// Copy and paste have a second guard in the exam renderer on every OS (renderer/services/clipboard-guard.ts).

/** Virtual-key codes (WinUser.h) the filter reads. */
export const VK = {
  TAB: 0x09,
  SHIFT: 0x10,
  CONTROL: 0x11,
  MENU: 0x12,
  ESCAPE: 0x1b,
  SNAPSHOT: 0x2c,
  INSERT: 0x2d,
  KEY_C: 0x43,
  KEY_V: 0x56,
  KEY_X: 0x58,
  LWIN: 0x5b,
  RWIN: 0x5c,
} as const;

/** KBDLLHOOKSTRUCT.flags: Alt was down when the key event happened. */
export const LLKHF_ALTDOWN = 0x20;

/** The fields of KBDLLHOOKSTRUCT the filter reads: the virtual-key code and the flags. */
export interface HookKey {
  readonly vkCode: number;
  readonly flags: number;
}

/** Whether a key is held right now (GetAsyncKeyState); asked only about Ctrl, Shift and Alt. */
export type IsKeyDown = (vkCode: number) => boolean;

type Rule = (key: HookKey, isDown: IsKeyDown) => boolean;

const altDown = (key: HookKey): boolean => (key.flags & LLKHF_ALTDOWN) !== 0;

/**
 * Ctrl held and Alt not. Ctrl+Alt is AltGr on many keyboard layouts, where AltGr+C, X or V types a
 * letter (Polish ć and ź, Czech & # @), so it is typing, not a copy shortcut, and goes on to Windows.
 */
const ctrlWithoutAlt = (key: HookKey, isDown: IsKeyDown): boolean =>
  isDown(VK.CONTROL) && !altDown(key) && !isDown(VK.MENU);

/**
 * One rule per virtual-key code; every other key goes straight on to Windows. Down and up events count
 * alike, so a swallowed key never reaches Windows half pressed (when Ctrl comes up before C, the lone
 * key-up of C goes on, which does nothing).
 */
const RULES: ReadonlyMap<number, Rule> = new Map<number, Rule>([
  // The Windows keys: Start, and every Win+ shortcut that Windows lets a hook stop (Win+D, Win+Tab,
  // Win+V's clipboard history, Win+Shift+S, Win+PrtScn, ...).
  [VK.LWIN, () => true],
  [VK.RWIN, () => true],
  // Alt+Tab, with Shift (backwards) and with Ctrl (the switcher that stays open): one task switcher.
  [VK.TAB, (key) => altDown(key)],
  // Alt+Esc (next window) and Ctrl+Esc (Start). Ctrl+Shift+Esc opens Task Manager and stays with Windows.
  [VK.ESCAPE, (key, isDown) => altDown(key) || (isDown(VK.CONTROL) && !isDown(VK.SHIFT))],
  // Copy, cut and paste: Ctrl+C, Ctrl+X, Ctrl+V, also with Shift (Ctrl+Shift+V pastes as plain text).
  // C, X and V alone, with Shift or with AltGr are typing and go on.
  [VK.KEY_C, ctrlWithoutAlt],
  [VK.KEY_X, ctrlWithoutAlt],
  [VK.KEY_V, ctrlWithoutAlt],
  // Ctrl+Insert (copy) and Shift+Insert (paste). Insert alone (overtype) goes on.
  [VK.INSERT, (_key, isDown) => isDown(VK.CONTROL) || isDown(VK.SHIFT)],
  // PrtScn, alone, with Alt (the active window) and with any other modifier: every Print Screen
  // shortcut, Windows 11's "Print screen opens Snipping Tool" included.
  [VK.SNAPSHOT, () => true],
]);

/** True for a key event the hook swallows during lockdown. */
export function shouldSwallow(key: HookKey, isDown: IsKeyDown): boolean {
  const rule = RULES.get(key.vkCode);
  return rule?.(key, isDown) === true;
}

/** The virtual-key codes that have a rule; every other code passes without a lookup of key state. */
export const SWALLOW_CANDIDATES: readonly number[] = [...RULES.keys()];
