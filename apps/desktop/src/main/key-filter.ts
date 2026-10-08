// The keys the Windows keyboard hook swallows during exam lockdown ("Windows keys" in
// docs/phase-0-plan.md): the Windows keys, Alt+Tab, Alt+Esc and Ctrl+Esc, and nothing more. Pure, so the
// list is tested without Windows. The hook (keyboard-hook-win32.ts) calls `shouldSwallow` for every key
// event while it is installed; the answer is a lookup by virtual-key code, and it never keeps the key.
//
// Left with Windows on purpose: Ctrl+Alt+Del and Win+L (no hook can stop them), Ctrl+Shift+Esc (Task
// Manager, as reachable through Ctrl+Alt+Del), and Ctrl+Shift+Q, the lab zip's development escape, which
// lockdown.ts reads in the window. Alt+F4 reaches the window and is refused there: close is blocked.

/** Virtual-key codes (WinUser.h) the filter reads. */
export const VK = {
  TAB: 0x09,
  SHIFT: 0x10,
  CONTROL: 0x11,
  MENU: 0x12,
  ESCAPE: 0x1b,
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

/** Whether a key is held right now (GetAsyncKeyState); asked only for Esc. */
export type IsKeyDown = (vkCode: number) => boolean;

type Rule = (key: HookKey, isDown: IsKeyDown) => boolean;

const altDown = (key: HookKey): boolean => (key.flags & LLKHF_ALTDOWN) !== 0;

/**
 * One rule per virtual-key code; every other key goes straight on to Windows. Down and up events count
 * alike, so a swallowed key never reaches Windows half pressed.
 */
const RULES: ReadonlyMap<number, Rule> = new Map<number, Rule>([
  // The Windows keys: Start, and every Win+ shortcut that Windows lets a hook stop (Win+D, Win+Tab, ...).
  [VK.LWIN, () => true],
  [VK.RWIN, () => true],
  // Alt+Tab, with Shift (backwards) and with Ctrl (the switcher that stays open): one task switcher.
  [VK.TAB, (key) => altDown(key)],
  // Alt+Esc (next window) and Ctrl+Esc (Start). Ctrl+Shift+Esc opens Task Manager and stays with Windows.
  [VK.ESCAPE, (key, isDown) => altDown(key) || (isDown(VK.CONTROL) && !isDown(VK.SHIFT))],
]);

/** True for a key event the hook swallows during lockdown. */
export function shouldSwallow(key: HookKey, isDown: IsKeyDown): boolean {
  const rule = RULES.get(key.vkCode);
  return rule?.(key, isDown) === true;
}

/** The virtual-key codes that have a rule; every other code passes without a lookup of key state. */
export const SWALLOW_CANDIDATES: readonly number[] = [...RULES.keys()];
