import type { ComponentProps } from "react";
import { cn } from "../cn.ts";
import { type FaceState, faceSrc } from "./faces.ts";

export interface FaceProps extends Omit<ComponentProps<"img">, "src" | "width" | "height" | "children"> {
  /** What Üki sees right now (Figma 4:123). */
  state?: FaceState;
  /** Width and height in px for the image attributes; Figma draws the face at 160. A size class wins over it. */
  size?: number;
}

/** Üki's face as a status light. Art: keeps its own colours. Decorative unless `alt` is given. */
export function Face({ state = "neutral", size = 160, alt = "", className, ...props }: FaceProps) {
  return (
    <img
      src={faceSrc(state)}
      width={size}
      height={size}
      alt={alt}
      draggable={false}
      data-state={state}
      className={cn("shrink-0 select-none", className)}
      {...props}
    />
  );
}
