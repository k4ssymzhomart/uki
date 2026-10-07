/** Which window chrome App/Title bar and Browser/Top bar draw (Figma property OS: macOS, Windows). */
export type WindowOs = "macos" | "windows";

/** Electron drag regions: the bar moves the window, its controls stay clickable. */
export const dragRegion = "[-webkit-app-region:drag]";
export const noDragRegion = "[-webkit-app-region:no-drag]";
