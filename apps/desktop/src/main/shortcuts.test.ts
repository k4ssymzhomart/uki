// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type InputLike, isBlockedShortcut, isDevEscape } from "./shortcuts.ts";

type Mods = Partial<Pick<InputLike, "control" | "meta" | "alt" | "shift">>;

function key(code: string, mods: Mods = {}, type = "keyDown"): InputLike {
  return {
    type,
    code,
    key: code.replace(/^Key|^Digit/, "").toLowerCase(),
    control: false,
    meta: false,
    alt: false,
    shift: false,
    ...mods,
  };
}

const cmd = { meta: true };
const ctrl = { control: true };

describe("isBlockedShortcut on macOS", () => {
  const blocked: Array<[string, InputLike]> = [
    ["reload", key("KeyR", cmd)],
    ["hard reload", key("KeyR", { ...cmd, shift: true })],
    ["F5", key("F5")],
    ["DevTools", key("KeyI", { ...cmd, alt: true })],
    ["console", key("KeyJ", { ...cmd, alt: true })],
    ["inspect element", key("KeyC", { ...cmd, alt: true })],
    ["F12", key("F12")],
    ["zoom in", key("Equal", cmd)],
    ["zoom in with Shift", key("Equal", { ...cmd, shift: true })],
    ["zoom out", key("Minus", cmd)],
    ["actual size", key("Digit0", cmd)],
    ["numpad zoom", key("NumpadAdd", cmd)],
    ["close tab", key("KeyW", cmd)],
    ["close window", key("KeyW", { ...cmd, shift: true })],
    ["quit", key("KeyQ", cmd)],
    ["hide", key("KeyH", cmd)],
    ["minimise", key("KeyM", cmd)],
    ["full screen", key("KeyF", { ...cmd, control: true })],
    ["new window", key("KeyN", cmd)],
  ];
  it.each(blocked)("drops %s", (_name, input) => {
    expect(isBlockedShortcut(input, "macos")).toBe(true);
  });

  const allowed: Array<[string, InputLike]> = [
    ["copy", key("KeyC", cmd)],
    ["paste", key("KeyV", cmd)],
    ["select all", key("KeyA", cmd)],
    ["undo", key("KeyZ", cmd)],
    ["typing", key("KeyR")],
    ["Shift+R", key("KeyR", { shift: true })],
    ["digits", key("Digit0")],
    ["Tab", key("Tab")],
    ["Enter", key("Enter")],
    ["Ctrl+R is not Cmd+R", key("KeyR", ctrl)],
    ["the key-up of Cmd+R", key("KeyR", cmd, "keyUp")],
  ];
  it.each(allowed)("lets %s through", (_name, input) => {
    expect(isBlockedShortcut(input, "macos")).toBe(false);
  });
});

describe("isBlockedShortcut on Windows", () => {
  const blocked: Array<[string, InputLike]> = [
    ["reload", key("KeyR", ctrl)],
    ["hard reload", key("KeyR", { ...ctrl, shift: true })],
    ["F5", key("F5")],
    ["Ctrl+F5", key("F5", ctrl)],
    ["DevTools", key("KeyI", { ...ctrl, shift: true })],
    ["console", key("KeyJ", { ...ctrl, shift: true })],
    ["inspect element", key("KeyC", { ...ctrl, shift: true })],
    ["view source", key("KeyU", ctrl)],
    ["F12", key("F12")],
    ["zoom in", key("Equal", ctrl)],
    ["zoom out", key("Minus", ctrl)],
    ["actual size", key("Digit0", ctrl)],
    ["numpad zoom out", key("NumpadSubtract", ctrl)],
    ["close tab", key("KeyW", ctrl)],
    ["Ctrl+F4", key("F4", ctrl)],
    ["Alt+F4", key("F4", { alt: true })],
    ["Ctrl+Q", key("KeyQ", ctrl)],
    ["F11", key("F11")],
  ];
  it.each(blocked)("drops %s", (_name, input) => {
    expect(isBlockedShortcut(input, "windows")).toBe(true);
  });

  const allowed: Array<[string, InputLike]> = [
    ["copy", key("KeyC", ctrl)],
    ["paste", key("KeyV", ctrl)],
    ["Cmd+R does not exist on Windows", key("KeyR", { meta: true })],
    ["typing", key("KeyW")],
    ["Alt alone on F5 is still F5", key("Digit5", { alt: true })],
  ];
  it.each(allowed)("lets %s through", (_name, input) => {
    expect(isBlockedShortcut(input, "windows")).toBe(false);
  });
});

describe("isDevEscape", () => {
  it("is Cmd+Shift+Q on macOS and Ctrl+Shift+Q on Windows", () => {
    expect(isDevEscape(key("KeyQ", { ...cmd, shift: true }), "macos")).toBe(true);
    expect(isDevEscape(key("KeyQ", { ...ctrl, shift: true }), "windows")).toBe(true);
    expect(isDevEscape(key("KeyQ", { ...ctrl, shift: true }), "macos")).toBe(false);
    expect(isDevEscape(key("KeyQ", cmd), "macos")).toBe(false);
    expect(isDevEscape(key("KeyQ", { ...cmd, shift: true }, "keyUp"), "macos")).toBe(false);
  });

  it("is also a blocked shortcut, so packaged builds drop it like every other Q shortcut", () => {
    expect(isBlockedShortcut(key("KeyQ", { ...cmd, shift: true }), "macos")).toBe(true);
    expect(isBlockedShortcut(key("KeyQ", { ...ctrl, shift: true }), "windows")).toBe(true);
  });
});
