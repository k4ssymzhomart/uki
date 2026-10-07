import { Select as SelectPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../cn.ts";
import { floatingListClasses } from "../feedback/menu-content.tsx";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";
import { Field, fieldState } from "./field.tsx";

/** Gap between the field and the open list: Figma puts the list 15 px under the field; space/16 is the nearest step. */
const LIST_OFFSET = 16;

export type SelectProps = Omit<ComponentProps<typeof SelectPrimitive.Root>, "children"> & {
  label: ReactNode;
  /** 18 px icon at the start of the field (Figma Icon, globe in the language picker). */
  icon?: IconName;
  /** Shown when nothing is selected. */
  placeholder?: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  /** SelectItem elements. */
  children: ReactNode;
  id?: string;
  /** Classes for the outer column. */
  className?: string;
  triggerClassName?: string;
  /** Portal target for the list; defaults to document.body. */
  container?: HTMLElement | null;
  "aria-describedby"?: string;
};

/**
 * Single choice field (Figma Select 79:2410). Closed and Open are Radix states: the list floats
 * under the field at the field's width, so opening it never moves the layout.
 */
export function Select({
  label,
  icon,
  placeholder,
  helper,
  error,
  children,
  id,
  className,
  triggerClassName,
  container,
  disabled,
  "aria-describedby": describedBy,
  ...props
}: SelectProps) {
  const autoId = useId();
  const controlId = id ?? `${autoId}-select`;
  const messageId = `${autoId}-message`;
  const state = fieldState({ error, disabled });
  const message = state === "error" ? error : helper;
  const describes = [describedBy, message ? messageId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <Field
      controlId={controlId}
      messageId={messageId}
      label={label}
      helper={helper}
      error={error}
      state={state}
      gap="sm"
      labelTone="muted"
      className={className}
    >
      <SelectPrimitive.Root disabled={disabled} {...props}>
        <SelectPrimitive.Trigger
          id={controlId}
          aria-invalid={state === "error" || undefined}
          aria-describedby={describes}
          className={cn(
            "group flex w-full cursor-pointer items-center gap-2.5 rounded-sm py-2.75 pr-3 pl-3.5 text-left text-fg-primary outline-none transition-shadow",
            "bg-surface inset-ring inset-ring-line-default data-[state=open]:inset-ring-2 data-[state=open]:inset-ring-line-strong",
            "focus-visible:shadow-focus focus-visible:inset-ring-2 focus-visible:inset-ring-line-focus",
            state === "error" && "inset-ring-2 inset-ring-flag",
            "disabled:cursor-not-allowed disabled:bg-subtle",
            triggerClassName,
          )}
        >
          {icon ? <Icon name={icon} className="size-4.5 group-disabled:opacity-45" /> : null}
          <span className="min-w-0 flex-1 truncate type-label-m group-disabled:opacity-45 group-data-placeholder:opacity-50">
            <SelectPrimitive.Value placeholder={placeholder} />
          </span>
          <SelectPrimitive.Icon asChild>
            <Icon
              name="chevron-down"
              className="size-4.5 transition-transform group-disabled:opacity-45 group-data-[state=open]:rotate-180"
            />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal container={container}>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={LIST_OFFSET}
            className={cn(
              floatingListClasses,
              "w-(--radix-select-trigger-width) max-h-(--radix-select-content-available-height)",
            )}
          >
            <SelectPrimitive.Viewport className="flex flex-col gap-0.5">{children}</SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </Field>
  );
}
