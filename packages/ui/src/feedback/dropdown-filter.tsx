import { Popover as PopoverPrimitive } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Button } from "../controls/button.tsx";
import { Checkbox } from "../controls/checkbox.tsx";
import { floatingListClasses } from "./menu-content.tsx";

export type DropdownFilterOption = {
  id: string;
  label: ReactNode;
  /** The number at the end of the row, already formatted: flags of this type. */
  count?: ReactNode;
  checked: boolean;
};

export type DropdownFilterProps = {
  /** The pill that opens it. */
  trigger: ReactElement;
  /** Small caps label above the rows: "Flag type". */
  header: ReactNode;
  options: readonly DropdownFilterOption[];
  onCheckedChange: (id: string, checked: boolean) => void;
  clearLabel: ReactNode;
  onClear: () => void;
  /** "Show 9 flags". */
  applyLabel: ReactNode;
  onApply: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Portal target; defaults to document.body. */
  container?: HTMLElement | null;
  className?: string;
};

/**
 * Dropdown/Filter (Figma 76:2284): a checkbox list under a menu header with Clear and an apply button,
 * for the review queue's flag types (3.2a). 300 px wide, surface, default stroke, 6 px padding,
 * Shadow/Float, aligned to the end of its trigger. Checking a row changes nothing until Apply.
 */
export function DropdownFilter({
  trigger,
  header,
  options,
  onCheckedChange,
  clearLabel,
  onClear,
  applyLabel,
  onApply,
  open,
  onOpenChange,
  container,
  className,
}: DropdownFilterProps) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={container}>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className={cn(floatingListClasses, "w-75", className)}
        >
          <p className="px-2.5 pt-2 pb-1 text-fg-primary opacity-50 type-mono-tag">{header}</p>
          {options.map((option) => (
            <div
              key={option.id}
              className="flex w-full items-center gap-2 overflow-clip rounded-sm px-2.5 py-1.75"
            >
              <Checkbox
                className="min-w-0 flex-1"
                label={option.label}
                checked={option.checked}
                onCheckedChange={(checked) => onCheckedChange(option.id, checked === true)}
              />
              {option.count === undefined ? null : (
                <span className="shrink-0 whitespace-nowrap opacity-50 type-ui-mono">{option.count}</span>
              )}
            </div>
          ))}
          <div aria-hidden="true" className="mx-1.5 my-1 h-px bg-line-default" />
          <div className="flex w-full items-center gap-2 px-1 pt-1 pb-0.5">
            <Button variant="ghost" onClick={onClear}>
              {clearLabel}
            </Button>
            <span aria-hidden="true" className="min-w-0 flex-1" />
            <Button variant="primary" onClick={onApply}>
              {applyLabel}
            </Button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
