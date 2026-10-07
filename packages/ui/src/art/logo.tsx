import type { ComponentProps } from "react";
import { cn } from "../cn.ts";
import { type LogoVariant, logoSrc } from "./logos.ts";

export interface LogoProps extends Omit<ComponentProps<"img">, "src" | "children"> {
  /** wordmark-ink on light, wordmark-paper on ink, wordmark-on-lime on lime; eyes glyph; app icon. */
  variant?: LogoVariant;
}

/** The Üki logo set. Size it with a class (for example `h-8 w-auto`) or the width and height attributes. */
export function Logo({ variant = "wordmark-ink", alt = "", className, ...props }: LogoProps) {
  return (
    <img
      src={logoSrc(variant)}
      alt={alt}
      draggable={false}
      data-variant={variant}
      className={cn("shrink-0 select-none", className)}
      {...props}
    />
  );
}
