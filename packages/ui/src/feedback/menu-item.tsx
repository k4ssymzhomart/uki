import { cva } from "class-variance-authority";
import { DropdownMenu } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";

/**
 * One menu row (Figma Menu item 71:2207). Hover is Radix's data-highlighted (pointer or keyboard),
 * Selected is data-state=checked. SelectItem reuses these classes.
 */
export const menuItemVariants = cva(
  [
    "relative flex w-full cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 py-2 text-left outline-none",
    "data-highlighted:bg-subtle data-[state=checked]:bg-brand-subtle",
    "data-disabled:cursor-not-allowed data-disabled:opacity-45",
  ],
  {
    variants: {
      tone: { default: "text-fg-primary", danger: "text-flag" },
    },
    defaultVariants: { tone: "default" },
  },
);

export type MenuItemTone = "default" | "danger";

type MenuItemOwnProps = {
  /** 18 px icon before the label. */
  icon?: IconName;
  /** Shortcut or value at the end, in mono (Figma Meta). */
  meta?: ReactNode;
  /** Danger for destructive actions: label and icon in status/flag. */
  tone?: MenuItemTone;
  /**
   * Marks the current choice. When set (true or false) the row is a menuitemcheckbox and shows the
   * check icon while selected; leave it undefined for a plain action.
   */
  selected?: boolean;
  children: ReactNode;
};

export type MenuItemProps = Omit<ComponentProps<typeof DropdownMenu.Item>, "children" | "asChild"> &
  MenuItemOwnProps;

/** Row of a <MenuContent>: icon, label, optional meta; Selected adds the check icon. */
export function MenuItem({
  icon,
  meta,
  tone = "default",
  selected,
  className,
  children,
  ...props
}: MenuItemProps) {
  const content = (
    <>
      {icon ? <Icon name={icon} className={cn("size-4.5", tone === "danger" && "text-flag")} /> : null}
      <span className="min-w-0 flex-1 type-label-m">{children}</span>
      {meta !== undefined && meta !== null ? (
        <span className="shrink-0 type-ui-mono text-fg-primary opacity-50">{meta}</span>
      ) : null}
    </>
  );
  const classes = cn(menuItemVariants({ tone }), className);

  if (selected === undefined) {
    return (
      <DropdownMenu.Item className={classes} {...props}>
        {content}
      </DropdownMenu.Item>
    );
  }

  return (
    <DropdownMenu.CheckboxItem className={classes} checked={selected} {...props}>
      {content}
      <DropdownMenu.ItemIndicator className="flex shrink-0 items-center">
        <Icon name="check" className="size-4" />
      </DropdownMenu.ItemIndicator>
    </DropdownMenu.CheckboxItem>
  );
}
