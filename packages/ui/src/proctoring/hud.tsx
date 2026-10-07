import type { ComponentProps, ReactNode } from "react";
import { Face } from "../art/face.tsx";
import type { FaceState } from "../art/faces.ts";
import { cn } from "../cn.ts";

export const HUD_KINDS = ["gaze", "phone", "tab"] as const;
export type HudKind = (typeof HUD_KINDS)[number];

const FACE: Record<HudKind, FaceState> = {
  gaze: "alert",
  phone: "flag",
  tab: "thinking",
};

/** The HUD stays 2.5 s, then fades in 200 ms (design handoff, Timings). The app owns the 2.5 s. */
export const HUD_VISIBLE_MS = 2500;

export interface HudProps extends Omit<ComponentProps<"div">, "children"> {
  /** gaze, phone or tab (Figma 15:1303). Sets the face. */
  kind?: HudKind;
  /** One line, for example "Eyes on the screen". */
  message: ReactNode;
  /** Short mono hint after the message, for example "2 s", "flag" or "Esc". */
  meta?: ReactNode;
  /** false fades the HUD out (200 ms) and takes it out of the accessibility tree. */
  visible?: boolean;
}

/** Glass HUD at the top of the exam window. Always dark: it sets data-theme="dark" on itself. */
export function Hud({ kind = "gaze", message, meta, visible = true, className, ...props }: HudProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={visible ? undefined : true}
      data-theme="dark"
      data-kind={kind}
      data-visible={visible}
      className={cn(
        "inline-flex items-center gap-3 rounded-pill border border-white/10 bg-canvas py-2 pr-4.5 pl-2 text-fg-primary shadow-float backdrop-blur-md",
        "transition-opacity duration-200 ease-out motion-reduce:transition-none",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
        className,
      )}
      {...props}
    >
      <Face state={FACE[kind]} className="size-8.5" />
      <span className="type-label-m whitespace-nowrap">{message}</span>
      {meta ? <span className="type-mono-s whitespace-nowrap">{meta}</span> : null}
    </div>
  );
}
