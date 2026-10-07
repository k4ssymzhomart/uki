import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../cn.ts";
import { Spinner } from "../feedback/spinner.tsx";

export type ButtonVariant = "primary" | "brand" | "secondary" | "ghost" | "danger";

/**
 * Figma Button 8:37. Strokes are inset rings so a state change never moves the label, as in Figma.
 * Focus: 2 px border/focus inside plus the 4 px Focus/Ring outside.
 */
export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-pill px-5.5 py-3",
    "type-label-m outline-none transition-colors",
    "focus-visible:shadow-focus focus-visible:inset-ring-2 focus-visible:inset-ring-line-focus",
  ],
  {
    variants: {
      tone: {
        primary: "bg-inverse text-fg-inverse",
        brand: "bg-brand text-fg-on-brand",
        secondary: "text-fg-primary inset-ring-2 inset-ring-line-strong",
        ghost: "text-fg-primary",
        danger: "bg-danger text-white",
        disabled: "cursor-not-allowed bg-subtle text-fg-primary",
      },
      interactive: { true: "cursor-pointer", false: "" },
    },
    compoundVariants: [
      { tone: "primary", interactive: true, class: "hover:bg-inverse-hover active:bg-inverse-pressed" },
      { tone: "brand", interactive: true, class: "hover:bg-brand-hover active:bg-brand-pressed" },
      { tone: "secondary", interactive: true, class: "hover:bg-hover active:bg-pressed" },
      { tone: "ghost", interactive: true, class: "hover:bg-hover active:bg-pressed" },
      { tone: "danger", interactive: true, class: "hover:bg-danger-hover active:bg-danger-pressed" },
    ],
    defaultVariants: { tone: "primary", interactive: true },
  },
);

export type ButtonProps = ComponentProps<"button"> & {
  /** Figma Style. Disabled is the native `disabled` prop, not a variant. */
  variant?: ButtonVariant;
  /** Figma State=Loading: a spinner before the label, the label at 80 %, clicks ignored. */
  loading?: boolean;
  /** Render the only child (for example a link) with the button's look instead of a <button>. */
  asChild?: boolean;
};

/** Pill button (Figma 8:37). The label is the children; it never comes from here. */
export function Button({
  variant = "primary",
  loading = false,
  disabled = false,
  asChild = false,
  type,
  className,
  children,
  onClick,
  ...props
}: ButtonProps) {
  const tone = disabled ? "disabled" : variant;
  const interactive = !disabled && !loading;
  const classes = cn(buttonVariants({ tone, interactive }), className);

  if (asChild) {
    return (
      <Slot.Root
        className={classes}
        data-variant={variant}
        aria-disabled={disabled || loading || undefined}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      type={type ?? "button"}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      data-variant={variant}
      className={classes}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : null}
      <span
        className={cn("inline-flex items-center gap-2", loading && "opacity-80", disabled && "opacity-45")}
      >
        {children}
      </span>
    </button>
  );
}
