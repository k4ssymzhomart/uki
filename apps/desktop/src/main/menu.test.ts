// @vitest-environment node
import { describe, expect, it } from "vitest";
import { appMenuTemplate } from "./menu.ts";

describe("appMenuTemplate", () => {
  it("keeps Electron's default menu in development builds", () => {
    expect(appMenuTemplate("macos", false)).toBeUndefined();
    expect(appMenuTemplate("windows", false)).toBeUndefined();
  });

  it("has no View menu (reload, DevTools, zoom) in packaged builds", () => {
    const mac = appMenuTemplate("macos", true);
    expect(mac?.map((item) => item.role)).toEqual(["appMenu", "editMenu", "windowMenu"]);
    expect(JSON.stringify(mac)).not.toMatch(/reload|toggleDevTools|zoom|viewMenu/i);
    expect(appMenuTemplate("windows", true)).toBeNull();
  });
});
