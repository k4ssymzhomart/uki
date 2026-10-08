import { Dialog as DialogPrimitive } from "radix-ui";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";

export type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** UI/Title in the head: "Identity help". */
  title: ReactNode;
  /** Accessible name of the close button. */
  closeLabel: string;
  /** The scrolling body. */
  children: ReactNode;
  /** The footer under a separator: a caption and the actions, right-aligned. */
  footer?: ReactNode;
  /** Portal target; defaults to document.body. */
  container?: HTMLElement | null;
  className?: string;
};

/**
 * A side drawer on the right over a 40 % bg-inverse scrim, as 1.5b's Identity help (Figma 156:12478)
 * draws it: 460 px wide and full height, surface, Shadow/Float; the head with UI/Title and a close icon,
 * a scrolling body and an optional footer. Escape, the scrim and the close icon close it; focus stays
 * inside while it is open and returns to the opener after.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
  footer,
  container,
  className,
}: DrawerProps) {
  // The drawer often opens from something that goes away (a popover's button), so it keeps the element
  // that had the focus when it opened (a layout effect, before the drawer moves the focus inside) and
  // gives the focus back to it, if it is still on the page.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
  }, [open]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-inverse/40" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            const target = opener.current;
            opener.current = null;
            if (target?.isConnected) {
              event.preventDefault();
              target.focus();
            }
          }}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-115 max-w-full flex-col overflow-clip bg-surface text-fg-primary shadow-float outline-none",
            className,
          )}
        >
          <div className="flex w-full items-center justify-between gap-3 pt-6 pr-6 pb-4 pl-7">
            <DialogPrimitive.Title className="min-w-0 flex-1 type-ui-title">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-pill outline-none transition-colors hover:bg-hover focus-visible:shadow-focus"
            >
              <Icon name="close" className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex min-h-0 w-full flex-1 flex-col gap-5 overflow-y-auto px-7 pb-5">
            {children}
          </div>
          {footer ? (
            <div className="flex w-full items-center justify-end gap-2.5 border-t border-line-default px-7 pt-4 pb-5">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
