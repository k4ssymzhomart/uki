"use client";

import { useLayoutEffect } from "react";

/**
 * The live wall and its drawer render dark (Figma 2.4, 2.5), sidebar included, so the theme goes on
 * <html> while the wall is mounted; menus and dialogs portalled to <body> follow it. The previous
 * value comes back when the proctor leaves the wall.
 */
export function DarkTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "dark");
    return () => {
      if (previous === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", previous);
    };
  }, []);
  return null;
}
