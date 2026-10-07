import type { ComponentProps, ReactNode } from "react";
import type { FaceState } from "../art/faces.ts";
import { cn } from "../cn.ts";
import type { BadgeTone } from "../data/badge.tsx";
import type { StatusDotTone } from "../proctoring/status-dot.tsx";
import { LockPopupFooter } from "./lock-popup-footer.tsx";
import { LockPopupHeader } from "./lock-popup-header.tsx";

/** What every Üki Lock popup shows above and below its body. */
export interface LockPopupFrameProps {
  /** Header title, the product name "Üki Lock". */
  headerTitle: ReactNode;
  /** Header badge label for this state. */
  badge: ReactNode;
  badgeTone?: BadgeTone;
  headerFace?: FaceState;
  /** Footer text: the link with the Üki app. */
  footer: ReactNode;
  footerDot?: boolean;
  footerDotTone?: Extract<StatusDotTone, "ok" | "warn" | "flag">;
  /**
   * true (default) draws the Figma card: border, radius and shadow. Pass false inside the real
   * extension popup, where the browser draws the window.
   */
  framed?: boolean;
}

export interface LockPopupProps
  extends LockPopupFrameProps,
    Omit<ComponentProps<"div">, "children" | "title"> {
  children: ReactNode;
}

/** The 360 px Üki Lock popup shell: header, body, footer. The four Ext/Popup frames build on it. */
export function LockPopup({
  headerTitle,
  badge,
  badgeTone,
  headerFace,
  footer,
  footerDot,
  footerDotTone,
  framed = true,
  children,
  className,
  ...props
}: LockPopupProps) {
  return (
    <div
      className={cn(
        "flex w-90 flex-col items-stretch overflow-hidden bg-surface text-fg-primary",
        framed && "rounded-md border border-line-default shadow-float",
        className,
      )}
      {...props}
    >
      <LockPopupHeader title={headerTitle} badge={badge} badgeTone={badgeTone} face={headerFace} />
      <div className="flex flex-col items-stretch gap-3.5 px-4 pt-4 pb-4.5">{children}</div>
      <LockPopupFooter text={footer} showDot={footerDot} dotTone={footerDotTone} />
    </div>
  );
}
