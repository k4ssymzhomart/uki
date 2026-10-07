// The application menu. Packaged builds have no View menu, so there is no reload, DevTools or zoom item
// to reach; macOS keeps the app, Edit and Window menus (Edit carries Cmd+C, Cmd+V and Cmd+A for the
// join form), and Windows shows no menu bar at all. Development builds keep Electron's default menu.
// Every item is a role, so Electron and the OS label it; Üki adds no menu strings.
import type { DesktopOs } from "@uki/contracts";
import type { MenuItemConstructorOptions } from "electron";

/** `undefined`: keep Electron's default menu; `null`: no menu; otherwise the template to build. */
export function appMenuTemplate(
  os: DesktopOs,
  isPackaged: boolean,
): MenuItemConstructorOptions[] | null | undefined {
  if (!isPackaged) return undefined;
  if (os === "windows") return null;
  return [{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }];
}
