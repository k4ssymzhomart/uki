import { Switch } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../cn.ts";

export type ToggleProps = Omit<ComponentProps<typeof Switch.Root>, "children" | "asChild">;

/**
 * On/off switch (Figma Toggle 15:1314): a 46 × 28 pill, lime when on, paper when off, with a 22 px
 * white knob. It has no visible label: pass aria-label, or aria-labelledby pointing at the row title.
 */
export function Toggle({ className, ...props }: ToggleProps) {
  return (
    <Switch.Root
      className={cn(
        "relative inline-flex h-7 w-11.5 shrink-0 cursor-pointer items-center rounded-pill bg-subtle outline-none transition-colors",
        "data-[state=checked]:bg-brand focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <Switch.Thumb
        className={cn(
          "block size-5.5 translate-x-0.75 rounded-pill bg-white shadow-sm transition-transform",
          "data-[state=checked]:translate-x-5.25",
        )}
      />
    </Switch.Root>
  );
}
