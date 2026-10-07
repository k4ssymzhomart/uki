import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../cn.ts";
import { Button } from "../controls/button.tsx";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";

export type DialogTone = "default" | "danger";

export type DialogProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the dialog (rendered as the Radix trigger with asChild). Optional when controlled. */
  trigger?: ReactNode;
  /** Danger for destructive actions (End session, Delete data): flag-subtle badge, alert icon, Danger button. */
  tone?: DialogTone;
  /** Icon in the 44 px badge; info for Default and alert for Danger unless set. */
  icon?: IconName;
  title: ReactNode;
  body?: ReactNode;
  /** Optional content between the text and the actions, for example a <TextArea> (Figma Show field). */
  children?: ReactNode;
  /** Label of the Secondary button that closes the dialog. */
  cancelLabel: ReactNode;
  /** Label of the Primary (or Danger) button. */
  confirmLabel: ReactNode;
  /** Called by the confirm button. The dialog stays open; close it through open/onOpenChange. */
  onConfirm?: () => void;
  confirmLoading?: boolean;
  confirmDisabled?: boolean;
  /** Portal target; defaults to document.body. */
  container?: HTMLElement | null;
  /**
   * Modal (default): scrim, focus trapped, the rest of the page inert. Non-modal drops the scrim;
   * the gallery uses it with a container and className="static translate-none" to show the panel inline.
   */
  modal?: boolean;
  className?: string;
};

/**
 * Modal dialog on a 40 % bg-inverse scrim (Figma Dialog 144:2725): ink on light pages, a paper wash on
 * dark ones such as the live wall (2.4e, 181:18746). Icon badge, title, body, an optional field and the
 * Cancel and confirm buttons. Escape and Cancel close it; focus stays inside while open.
 */
export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  tone = "default",
  icon,
  title,
  body,
  children,
  cancelLabel,
  confirmLabel,
  onConfirm,
  confirmLoading = false,
  confirmDisabled = false,
  container,
  modal = true,
  className,
}: DialogProps) {
  const danger = tone === "danger";
  return (
    <DialogPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} modal={modal}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-inverse/40" />
        <DialogPrimitive.Content
          data-tone={tone}
          {...(body ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={modal ? undefined : (event) => event.preventDefault()}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-full w-110 max-w-full -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto",
            "rounded-card bg-surface px-7 pt-7 pb-6 text-fg-primary shadow-float inset-ring inset-ring-line-default outline-none",
            className,
          )}
        >
          <div className="flex w-full items-start gap-4">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-pill",
                danger ? "bg-flag-subtle" : "bg-brand-subtle",
              )}
            >
              <Icon name={icon ?? (danger ? "alert" : "info")} className="size-5.5" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <DialogPrimitive.Title className="type-ui-title">{title}</DialogPrimitive.Title>
              {body ? (
                <DialogPrimitive.Description className="type-body-s opacity-72">
                  {body}
                </DialogPrimitive.Description>
              ) : null}
            </div>
          </div>
          {children ? <div className="w-full">{children}</div> : null}
          <div className="flex w-full items-center justify-end gap-2.5">
            <DialogPrimitive.Close asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </DialogPrimitive.Close>
            <Button
              variant={danger ? "danger" : "primary"}
              loading={confirmLoading}
              disabled={confirmDisabled}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
