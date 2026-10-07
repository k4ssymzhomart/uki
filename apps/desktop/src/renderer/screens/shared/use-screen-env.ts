import type { DesktopOs } from "@uki/contracts";
import type { UkiBridge } from "@uki/contracts/ipc";
import type { Locale } from "@uki/i18n";
import { useEffect, useState } from "react";
import { useLocale } from "use-intl";
import { localeFromTag } from "./format.ts";

/** The student's language as the IntlProvider renders it (the model's locale until it catches up). */
export function useScreenLocale(fallback: Locale): Locale {
  return localeFromTag(useLocale(), fallback);
}

function bridge(): UkiBridge | undefined {
  return (window as { uki?: UkiBridge }).uki;
}

/**
 * The OS whose window chrome App/Title bar draws: `os` when given (gallery, tests), otherwise
 * window.uki.app.info(). Unlike lib/use-window-os it tolerates a page without the preload bridge.
 */
export function useScreenOs(os?: DesktopOs): DesktopOs {
  const [reported, setReported] = useState<DesktopOs>("macos");
  useEffect(() => {
    if (os !== undefined) return;
    const info = bridge()?.app?.info;
    if (typeof info !== "function") return;
    let active = true;
    info()
      .then((result) => {
        if (active) setReported(result.os);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [os]);
  return os ?? reported;
}
