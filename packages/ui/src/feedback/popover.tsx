import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { Face } from "../art/face.tsx";
import { cn } from "../cn.ts";

/**
 * Popover root and trigger, straight from Radix. Compose:
 * <Popover><PopoverTrigger asChild><button … /></PopoverTrigger><PopoverInfo … /></Popover>
 */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;
/** Positions the popover against another element than its trigger, for example a whole stat tile. */
export const PopoverAnchor = PopoverPrimitive.Anchor;

export type PopoverInfoRow = { id: string; label: ReactNode; value: ReactNode };

export type PopoverInfoProps = Omit<ComponentProps<typeof PopoverPrimitive.Content>, "title" | "children"> & {
  /** Card/Title next to Üki's face: "Why 0 MB?". */
  title: ReactNode;
  /** Two lines of Card/Caption at 62 %. */
  body: ReactNode;
  /** Up to three key values on bg/subtle: label in UI/Label, value in UI/Mono at 60 %. */
  rows?: readonly PopoverInfoRow[];
  /** A link under the rows, for example "Open privacy centre" with an arrow. */
  footer?: ReactNode;
  /** Portal target; defaults to document.body. */
  container?: HTMLElement | null;
};

/**
 * Popover/Info (Figma 76:2333): a mini info card behind an info icon, where Üki explains a number or a
 * setting in two lines plus up to three key values. 320 px wide, surface, default stroke, Shadow/Float.
 */
export function PopoverInfo({
  title,
  body,
  rows = [],
  footer,
  container,
  className,
  sideOffset = 8,
  align = "end",
  ...props
}: PopoverInfoProps) {
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 flex w-80 flex-col items-start gap-3 rounded-md bg-surface p-4 text-fg-primary shadow-float inset-ring inset-ring-line-default outline-none",
          className,
        )}
        {...props}
      >
        <div className="flex w-full items-center gap-2.5 overflow-clip">
          <Face state="neutral" size={24} className="size-6 shrink-0" />
          <p className="min-w-0 flex-1 type-card-title">{title}</p>
        </div>
        <p className="w-full opacity-62 type-card-caption">{body}</p>
        {rows.length > 0 ? (
          <dl className="flex w-full flex-col overflow-clip rounded-sm bg-subtle px-3 py-1">
            {rows.map((row, index) => (
              <div
                key={row.id}
                className={cn(
                  "flex w-full items-center gap-2 overflow-clip py-2",
                  index < rows.length - 1 && "border-b border-line-default",
                )}
              >
                <dt className="min-w-0 flex-1 type-ui-label">{row.label}</dt>
                <dd className="shrink-0 whitespace-nowrap opacity-60 type-ui-mono">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {footer}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
