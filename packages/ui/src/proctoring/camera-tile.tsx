import type { ComponentProps, ReactNode } from "react";
import { assetUrl } from "../art/asset-url.ts";
import { cn } from "../cn.ts";
import faceFrame from "./assets/face-frame.svg";
import { StatusDot, type StatusDotTone } from "./status-dot.tsx";

export interface CameraTileProps extends Omit<ComponentProps<"div">, "children"> {
  /** The live preview filling the tile: a <video> or <canvas> from the laptop's own camera. */
  children?: ReactNode;
  /** Top pill, for example "LIVE · LOCAL". */
  liveLabel: ReactNode;
  /** Bottom pill, for example "1 face". Hidden when absent. */
  facesLabel?: ReactNode;
  /** Dot of the bottom pill: ok for exactly one face (Figma), warn or flag otherwise. */
  facesTone?: Extract<StatusDotTone, "ok" | "warn" | "flag">;
  /** The lime corners that frame the face. */
  showFaceFrame?: boolean;
}

/**
 * Camera preview (Figma 15:1373). The frame stays on the student's laptop.
 * Always dark, whatever the page theme: it sets data-theme="dark" on itself.
 */
export function CameraTile({
  children,
  liveLabel,
  facesLabel,
  facesTone = "ok",
  showFaceFrame = true,
  className,
  ...props
}: CameraTileProps) {
  return (
    <div
      data-theme="dark"
      className={cn("relative h-56 w-90 overflow-hidden rounded-card bg-surface text-fg-primary", className)}
      {...props}
    >
      <div className="absolute inset-0 *:size-full *:object-cover">{children}</div>
      {showFaceFrame ? (
        <img
          src={assetUrl(faceFrame)}
          alt=""
          aria-hidden="true"
          className="-translate-x-1/2 pointer-events-none absolute top-7.5 left-1/2 size-38"
        />
      ) : null}
      <div className="absolute top-3.5 left-3.5 flex items-center gap-2 rounded-pill bg-canvas px-2.5 py-1.5">
        <StatusDot tone="brand" className="size-1.75" />
        <span className="type-mono-tag whitespace-nowrap">{liveLabel}</span>
      </div>
      {facesLabel ? (
        <div className="absolute bottom-3.5 left-3.5 flex items-center gap-2 rounded-pill bg-canvas px-2.5 py-1.5">
          <StatusDot tone={facesTone} className="size-1.75" />
          <span className="type-mono-s whitespace-nowrap">{facesLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
