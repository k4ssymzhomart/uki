import type { DesktopOs } from "@uki/contracts";
import { useEffect, useState } from "react";

/** The OS whose window chrome App/Title bar draws, from window.uki.app.info(). */
export function useWindowOs(initial: DesktopOs = "macos"): DesktopOs {
  const [os, setOs] = useState<DesktopOs>(initial);
  useEffect(() => {
    let active = true;
    window.uki.app
      .info()
      .then((info) => {
        if (active) setOs(info.os);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return os;
}
