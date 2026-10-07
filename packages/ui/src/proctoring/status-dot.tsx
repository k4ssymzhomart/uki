import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../cn.ts";

const statusDot = cva("inline-block shrink-0 rounded-pill", {
  variants: {
    tone: {
      ok: "bg-ok",
      warn: "bg-warn",
      flag: "bg-flag",
      /** Ink on light, paper on dark: the paused dot of Student tile and Widget/Live. */
      idle: "bg-icon-primary",
      brand: "bg-brand",
    },
  },
  defaultVariants: { tone: "ok" },
});

export type StatusDotTone = NonNullable<VariantProps<typeof statusDot>["tone"]>;

export interface StatusDotProps
  extends Omit<ComponentProps<"span">, "children">,
    VariantProps<typeof statusDot> {}

/** The coloured status circle of tiles, widgets and popups. Decorative: the state is always said in text too. */
export function StatusDot({ tone, className, ...props }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      data-tone={tone ?? "ok"}
      className={cn(statusDot({ tone }), className)}
      {...props}
    />
  );
}
