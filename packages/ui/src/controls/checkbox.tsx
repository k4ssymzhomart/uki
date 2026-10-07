import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../cn.ts";
import { glyphs, TICK_STROKE } from "../icons.ts";

export type CheckboxProps = Omit<ComponentProps<typeof CheckboxPrimitive.Root>, "children" | "asChild"> & {
  /** Text next to the box. Without it, give the box an aria-label. */
  label?: ReactNode;
  /** Classes for the row (box and label). */
  className?: string;
  /** Classes for the box. */
  boxClassName?: string;
};

/**
 * Checkbox with label (Figma 49:2176): checked is lime with an ink tick; unchecked is a strong
 * stroke at 45 %. Space toggles it; clicking the label toggles it too.
 */
export function Checkbox({ label, id, className, boxClassName, disabled, ...props }: CheckboxProps) {
  const autoId = useId();
  const boxId = id ?? `${autoId}-checkbox`;
  const Tick = glyphs.tick;
  return (
    <div className={cn("inline-flex items-center gap-2.5", disabled && "opacity-45", className)}>
      <CheckboxPrimitive.Root
        id={boxId}
        disabled={disabled}
        className={cn(
          "peer inline-flex size-5.5 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[calc(var(--radius-sm)/2)] outline-none transition-colors",
          "bg-surface inset-ring-2 inset-ring-line-strong/45",
          "data-[state=checked]:bg-brand data-[state=checked]:inset-ring-0",
          "data-[state=indeterminate]:bg-brand data-[state=indeterminate]:inset-ring-0",
          "focus-visible:shadow-focus disabled:cursor-not-allowed",
          boxClassName,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-fg-on-brand">
          <Tick aria-hidden="true" focusable="false" className="size-3.5" strokeWidth={TICK_STROKE} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label ? (
        <label
          htmlFor={boxId}
          className={cn("cursor-pointer type-body-s text-fg-primary", disabled && "cursor-not-allowed")}
        >
          {label}
        </label>
      ) : null}
    </div>
  );
}
