import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

/** Figma: "Rotates 360° every 0.8 s, linear." */
const SPIN_DURATION = "0.8s";

const spinnerVariants = cva("shrink-0 animate-spin", {
  variants: {
    /** sm 14 px (Button), md 16 px (Toast), lg 20 px (the Spinner component, Figma 145:2771). */
    size: { sm: "size-3.5", md: "size-4", lg: "size-5" },
  },
  defaultVariants: { size: "lg" },
});

export type SpinnerProps = Omit<ComponentProps<"svg">, "children"> &
  VariantProps<typeof spinnerVariants> & {
    /** Accessible name, for example "Loading". Without it the spinner is decorative. */
    label?: ReactNode;
  };

/**
 * Three-quarter ring that spins (Figma Spinner 145:2771). It takes the current text colour,
 * so it matches the label it sits next to; the stroke is 15 % of the size at every size, as in Figma.
 * With a label it is wrapped in a role="status" region that announces the label.
 */
export function Spinner({ size, label, className, style, ...props }: SpinnerProps) {
  const ring = (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      focusable="false"
      aria-hidden="true"
      data-slot="spinner"
      className={cn(spinnerVariants({ size }), className)}
      style={{ animationDuration: SPIN_DURATION, ...style }}
      {...props}
    >
      <path fill="currentColor" d="M10 0a10 10 0 1 1-10 10h3a7 7 0 1 0 7-7V0Z" />
    </svg>
  );
  if (label === undefined || label === null || label === "") return ring;
  return (
    <span role="status" className="inline-flex shrink-0">
      {ring}
      <span className="sr-only">{label}</span>
    </span>
  );
}
