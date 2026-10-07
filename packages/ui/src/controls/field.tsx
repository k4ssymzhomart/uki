import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "../cn.ts";

/**
 * The bordered box of Input, Text area and Select (Figma 142:13172, 143:13134, 79:2410).
 * Strokes are inset rings, like Figma's inside strokes, so the text never moves between states.
 */
export const fieldBoxVariants = cva(
  "flex w-full gap-2.5 overflow-hidden rounded-sm pr-3 pl-3.5 text-fg-primary transition-shadow",
  {
    variants: {
      state: {
        default:
          "bg-surface inset-ring inset-ring-line-default focus-within:shadow-focus focus-within:inset-ring-2 focus-within:inset-ring-line-focus",
        error: "bg-surface inset-ring-2 inset-ring-flag focus-within:shadow-focus",
        disabled: "cursor-not-allowed bg-subtle inset-ring inset-ring-line-default",
      },
      multiline: { true: "h-28 items-start py-3", false: "items-center py-2.75" },
    },
    defaultVariants: { state: "default", multiline: false },
  },
);

export type FieldState = "default" | "error" | "disabled";

export function fieldState({ error, disabled }: { error?: ReactNode; disabled?: boolean }): FieldState {
  if (disabled) return "disabled";
  if (error !== undefined && error !== null && error !== false) return "error";
  return "default";
}

export type FieldProps = {
  /** id of the control the label points at. */
  controlId: string;
  /** id given to the helper or error line, for aria-describedby. */
  messageId: string;
  label: ReactNode;
  helper?: ReactNode;
  /** Error message. It replaces the helper and turns the stroke and the message red. */
  error?: ReactNode;
  state: FieldState;
  /** Gap under the label: 8 px for Input and Text area, 6 px for Select. */
  gap?: "sm" | "md";
  /** Label opacity: Select draws its label at 70 %. */
  labelTone?: "default" | "muted";
  className?: string;
  children: ReactNode;
};

/** Label above, control, helper or error below. Shared by Input, TextArea and Select. */
export function Field({
  controlId,
  messageId,
  label,
  helper,
  error,
  state,
  gap = "md",
  labelTone = "default",
  className,
  children,
}: FieldProps) {
  const message = state === "error" ? error : helper;
  const hasMessage = message !== undefined && message !== null && message !== false && message !== "";
  return (
    <div className={cn("flex w-full flex-col items-start", gap === "md" ? "gap-2" : "gap-1.5", className)}>
      <label
        htmlFor={controlId}
        className={cn(
          "type-label-m text-fg-primary",
          labelTone === "muted" && "opacity-70",
          state === "disabled" && "opacity-55",
        )}
      >
        {label}
      </label>
      {children}
      {hasMessage ? (
        <p
          id={messageId}
          className={cn(
            "type-ui-caption",
            state === "error" ? "text-fg-danger" : "text-fg-primary opacity-58",
          )}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
