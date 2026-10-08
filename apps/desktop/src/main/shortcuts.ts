// Keyboard shortcuts during exam lockdown ("Hardening" in docs/phase-0-plan.md): `before-input-event`
// drops reload, DevTools, zoom, close-tab and quit shortcuts, and the shortcuts that would hide, minimise
// or un-full-screen the exam window. Pure, so the lists are tested without Electron.
import type { DesktopOs } from "@uki/contracts";

/** The fields of Electron's `Input` this module reads. */
export interface InputLike {
  readonly type: string;
  readonly key: string;
  readonly code: string;
  readonly control: boolean;
  readonly meta: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

type Combo = {
  /** KeyboardEvent.code values; matched without regard to the keyboard layout. */
  codes: readonly string[];
  /** Cmd on macOS, Ctrl on Windows. */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** macOS only: the Control key next to Cmd (Ctrl+Cmd+F). */
  control?: boolean;
};

const ZOOM_CODES = ["Equal", "Minus", "Digit0", "NumpadAdd", "NumpadSubtract", "Numpad0"] as const;

/** Combos dropped on both systems; `mod` is Cmd on macOS and Ctrl on Windows. */
const COMMON: readonly Combo[] = [
  // Reload and hard reload.
  { codes: ["KeyR"], mod: true },
  { codes: ["KeyR"], mod: true, shift: true },
  { codes: ["F5"] },
  { codes: ["F5"], shift: true },
  { codes: ["F5"], mod: true },
  // DevTools.
  { codes: ["F12"] },
  // Zoom in, zoom out, actual size (with and without Shift: "+" is Shift+Equal on most layouts).
  { codes: ZOOM_CODES, mod: true },
  { codes: ZOOM_CODES, mod: true, shift: true },
  // Close tab or window, quit, new window.
  { codes: ["KeyW"], mod: true },
  { codes: ["KeyW"], mod: true, shift: true },
  { codes: ["KeyQ"], mod: true },
  // Log out on macOS; in development builds lockdown.ts reads it as the escape hatch first.
  { codes: ["KeyQ"], mod: true, shift: true },
  { codes: ["KeyN"], mod: true },
];

const MACOS: readonly Combo[] = [
  // DevTools, console, inspect element, view source.
  { codes: ["KeyI", "KeyJ", "KeyC", "KeyU"], mod: true, alt: true },
  // Hide, hide others, minimise, minimise all.
  { codes: ["KeyH"], mod: true },
  { codes: ["KeyH"], mod: true, alt: true },
  { codes: ["KeyM"], mod: true },
  { codes: ["KeyM"], mod: true, alt: true },
  // Toggle full screen.
  { codes: ["KeyF"], mod: true, control: true },
];

const WINDOWS: readonly Combo[] = [
  // DevTools, console, inspect element; view source.
  { codes: ["KeyI", "KeyJ", "KeyC"], mod: true, shift: true },
  { codes: ["KeyU"], mod: true },
  // Close window or tab.
  { codes: ["F4"], alt: true },
  { codes: ["F4"], mod: true },
  // Toggle full screen.
  { codes: ["F11"] },
];

function matches(input: InputLike, combo: Combo, os: DesktopOs): boolean {
  if (!combo.codes.includes(input.code)) return false;
  const mod = os === "macos" ? input.meta : input.control;
  // On Windows Ctrl is the mod key; on macOS Ctrl is only meaningful as `combo.control`.
  const control = os === "macos" ? input.control : false;
  const meta = os === "macos" ? false : input.meta;
  return (
    mod === (combo.mod ?? false) &&
    input.shift === (combo.shift ?? false) &&
    input.alt === (combo.alt ?? false) &&
    control === (combo.control ?? false) &&
    !meta
  );
}

function isKeyDown(input: InputLike): boolean {
  return input.type !== "keyUp" && input.type !== "char";
}

/** True for a shortcut that lockdown drops. Only key-down events count. */
export function isBlockedShortcut(input: InputLike, os: DesktopOs): boolean {
  if (!isKeyDown(input)) return false;
  const extra = os === "macos" ? MACOS : WINDOWS;
  return [...COMMON, ...extra].some((combo) => matches(input, combo, os));
}

/**
 * The development escape hatch: Cmd+Shift+Q on macOS, Ctrl+Shift+Q on Windows leaves lockdown. Only
 * development (unpackaged) builds and the lab zip listen for it; packaged builds drop it with every other
 * Q shortcut.
 */
export function isDevEscape(input: InputLike, os: DesktopOs): boolean {
  return isKeyDown(input) && matches(input, { codes: ["KeyQ"], mod: true, shift: true }, os);
}
