// The tray icon for exams in the browser, from the brand kit's icons/tray: on macOS the menu bar template
// (Figma "Menu bar icon" 6:43, black and alpha only, which macOS tints for light and dark bars); on
// Windows the colour icon at 16, 24 and 32 px for 100, 150 and 200 % scaling. Read with readFileSync
// so the same code works inside app.asar.
import { readFileSync } from "node:fs";
import type { DesktopOs } from "@uki/contracts";
import { type NativeImage, nativeImage } from "electron";
import tray16 from "./assets/tray-16.png?asset";
import tray24 from "./assets/tray-24.png?asset";
import tray32 from "./assets/tray-32.png?asset";
import template2x from "./assets/tray-template@2x.png?asset";
import template1x from "./assets/tray-template.png?asset";

function imageFrom(representations: ReadonlyArray<[scaleFactor: number, path: string]>): NativeImage {
  const image = nativeImage.createEmpty();
  for (const [scaleFactor, path] of representations) {
    image.addRepresentation({ scaleFactor, buffer: readFileSync(path) });
  }
  return image;
}

export function trayIcon(os: DesktopOs): NativeImage {
  if (os === "macos") {
    const image = imageFrom([
      [1, template1x],
      [2, template2x],
    ]);
    image.setTemplateImage(true);
    return image;
  }
  return imageFrom([
    [1, tray16],
    [1.5, tray24],
    [2, tray32],
  ]);
}
