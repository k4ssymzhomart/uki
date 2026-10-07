import { cn } from "@uki/ui";
import type { CSSProperties, ReactNode } from "react";
import { rectStyle, type ShareRect } from "./format.ts";

/** Width / height of the preview box: 520 × 420 in Figma, 400 × 323 under 1280 px. */
export const PREVIEW_ASPECT = 520 / 420;

export type CameraPreviewProps = {
  /** The live preview from the flow: a <video> or <canvas>; it fills the box with object-fit cover. */
  camera?: ReactNode;
  /** Frames, pills and chips drawn over the picture. */
  children?: ReactNode;
  className?: string;
};

/**
 * The large camera preview of 1.2 and 1.3 (520 × 420, radius xl; 400 × 323 under 1280 px so the
 * minimum 1024 × 700 window keeps its rows in view). The picture never leaves the laptop; this box only
 * shows what the flow renders into it. Ink until the camera starts.
 */
export function CameraPreview({ camera, children, className }: CameraPreviewProps) {
  return (
    <div
      className={cn(
        "relative h-80.75 w-100 shrink-0 overflow-clip rounded-xl bg-inverse xl:h-105 xl:w-130",
        className,
      )}
    >
      <div className="absolute inset-0 *:size-full *:object-cover">{camera}</div>
      {children}
    </div>
  );
}

const FACE_DASHES = {
  /** 1.2: 190 × 220, dashes 20 px long, 23 px in from each corner. */
  check: {
    h: "h-0.75 w-5",
    v: "h-5 w-0.75",
    l: "left-5.75",
    r: "right-5.75",
    t: "top-5.75",
    b: "bottom-5.75",
  },
  /** 1.3: 170 × 200, dashes 18 px long, 22 px in from each corner. */
  identity: {
    h: "h-0.75 w-4.5",
    v: "h-4.5 w-0.75",
    l: "left-5.5",
    r: "right-5.5",
    t: "top-5.5",
    b: "bottom-5.5",
  },
} as const;

/**
 * The Face frame: Figma draws it as a dashed rounded rectangle whose long gaps leave two lime dashes
 * per side near the corners. CSS dashes cannot space like that, so the eight dashes are drawn as is.
 * `rect` places it in shares of the preview box, so it follows the box's size.
 */
export function FaceFrame({ size, rect }: { size: keyof typeof FACE_DASHES; rect: ShareRect }) {
  const d = FACE_DASHES[size];
  return (
    <div
      aria-hidden="true"
      style={rectStyle(rect)}
      className="pointer-events-none absolute *:absolute *:bg-brand"
    >
      <span className={cn("top-0", d.l, d.h)} />
      <span className={cn("top-0", d.r, d.h)} />
      <span className={cn("bottom-0", d.l, d.h)} />
      <span className={cn("bottom-0", d.r, d.h)} />
      <span className={cn("left-0", d.t, d.v)} />
      <span className={cn("left-0", d.b, d.v)} />
      <span className={cn("right-0", d.t, d.v)} />
      <span className={cn("right-0", d.b, d.v)} />
    </div>
  );
}

/** The dashed lime Card frame on the 1.3 preview; place it with classes or style. */
export function DashedFrame({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn("pointer-events-none absolute border-3 border-brand border-dashed", className)}
    />
  );
}
