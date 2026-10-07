import { Select as SelectPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { menuItemVariants } from "../feedback/menu-item.tsx";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";

export type SelectItemProps = Omit<ComponentProps<typeof SelectPrimitive.Item>, "children" | "asChild"> & {
  /** The option's label; the closed field shows it when the option is chosen. */
  children: ReactNode;
  icon?: IconName;
  /** Mono value at the end, for example "ҚАЗ" (Figma Meta). */
  meta?: ReactNode;
};

/** One option of <Select>, drawn as a Menu item: hover is bg/subtle, the chosen one is lime with a check. */
export function SelectItem({ children, icon, meta, className, ...props }: SelectItemProps) {
  return (
    <SelectPrimitive.Item className={cn(menuItemVariants(), className)} {...props}>
      {icon ? <Icon name={icon} className="size-4.5" /> : null}
      <span className="min-w-0 flex-1 type-label-m">
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      </span>
      {meta !== undefined && meta !== null ? (
        <span className="shrink-0 type-ui-mono text-fg-primary opacity-50">{meta}</span>
      ) : null}
      <SelectPrimitive.ItemIndicator className="flex shrink-0 items-center">
        <Icon name="check" className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
