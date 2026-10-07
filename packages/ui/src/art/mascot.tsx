import type { ComponentProps } from "react";
import { cn } from "../cn.ts";
import { type MascotPose, mascotSrc } from "./mascots.ts";

export interface MascotProps extends Omit<ComponentProps<"img">, "src" | "width" | "height" | "children"> {
  /** One of the 22 poses of Figma 3:24. */
  pose?: MascotPose;
  /** Width and height of the square box in px; Figma draws poses at 480. The pose keeps its proportions. */
  size?: number;
}

/** Üki the lime bean. Art: keeps its own colours. Decorative unless `alt` is given. */
export function Mascot({ pose = "master", size = 480, alt = "", className, ...props }: MascotProps) {
  return (
    <img
      src={mascotSrc(pose)}
      width={size}
      height={size}
      alt={alt}
      draggable={false}
      data-pose={pose}
      className={cn("shrink-0 select-none object-contain", className)}
      {...props}
    />
  );
}
