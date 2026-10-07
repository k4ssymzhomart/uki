import { ToggleGroup } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

export type TabProps = Omit<ComponentProps<typeof ToggleGroup.Item>, "children" | "asChild"> & {
  value: string;
  /** "ENG", "Need help · 3". */
  children: ReactNode;
};

/** One segmented tab; place it inside a TabGroup (Figma Tab 40:2060). Active: surface with a border. */
export function Tab({ className, children, ...props }: TabProps) {
  return (
    <ToggleGroup.Item
      className={cn(
        "flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-pill px-3.5 py-1.75 text-fg-primary/60 outline-none type-ui-label hover:text-fg-primary focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:bg-surface data-[state=on]:inset-ring data-[state=on]:inset-ring-line-default data-[state=on]:text-fg-primary",
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroup.Item>
  );
}
