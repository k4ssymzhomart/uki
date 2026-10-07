import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

export type BadgeTone = "brand" | "ink" | "neutral" | "warn" | "ok";

const badge = cva(
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-pill px-2 py-1 type-mono-tag",
  {
    variants: {
      tone: {
        brand: "bg-brand text-fg-on-brand",
        ink: "bg-inverse text-fg-inverse",
        neutral: "bg-subtle text-fg-primary/70",
        warn: "bg-warn-subtle text-fg-primary",
        ok: "bg-ok-subtle text-fg-primary",
      },
    },
  },
);

export type BadgeProps = Omit<ComponentProps<"span">, "children"> & {
  tone?: BadgeTone;
  /** Short label; the Mono/Tag style upper-cases it. */
  children: ReactNode;
};

/** Small status label for popups and headers (Figma Badge 89:2454). */
export function Badge({ tone = "brand", className, children, ...props }: BadgeProps) {
  return (
    <span data-tone={tone} className={cn(badge({ tone }), className)} {...props}>
      {children}
    </span>
  );
}
