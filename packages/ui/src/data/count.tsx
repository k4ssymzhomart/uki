import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

export type CountTone = "neutral" | "flag" | "warn" | "brand";

const count = cva(
  "inline-flex min-w-5.5 shrink-0 items-center justify-center whitespace-nowrap rounded-pill px-1.75 py-0.5 type-ui-mono",
  {
    variants: {
      tone: {
        neutral: "bg-subtle text-fg-primary",
        flag: "bg-flag text-fg-inverse",
        warn: "bg-warn text-fg-on-brand",
        brand: "bg-brand text-fg-on-brand",
      },
    },
  },
);

export type CountProps = Omit<ComponentProps<"span">, "children"> & {
  tone?: CountTone;
  /** The number, already formatted for the locale. */
  children: ReactNode;
};

/** Small numeric badge for nav counts, flag totals and table cells (Figma Count 39:2054). */
export function Count({ tone = "neutral", className, children, ...props }: CountProps) {
  return (
    <span data-tone={tone} className={cn(count({ tone }), className)} {...props}>
      {children}
    </span>
  );
}
