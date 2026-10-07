import { Toast as ToastPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
import { Spinner } from "./spinner.tsx";

export type ToastKind = "success" | "info" | "error" | "progress";

/** Figma: "Bottom-centre, 4 s; errors stay until closed." Progress also stays until it is replaced or closed. */
export const TOAST_DURATION_MS = 4000;

const DOT: Record<Exclude<ToastKind, "progress">, string> = {
  success: "bg-ok",
  info: "bg-brand",
  error: "bg-flag",
};

export type ToastProps = Omit<ComponentProps<typeof ToastPrimitive.Root>, "children" | "title" | "type"> & {
  kind?: ToastKind;
  message: ReactNode;
  /** Label of the lime action, for example "Undo" (Figma Action). Not shown on Progress. */
  action?: ReactNode;
  /** Screen-reader instruction for the action; defaults to the action when it is a string. */
  actionAltText?: string;
  onAction?: () => void;
  /** Accessible name of the close button. */
  closeLabel: string;
};

/**
 * Dashboard and app toast (Figma Toast 145:2732), always dark whatever the page theme: an 8 px status
 * dot (or a spinner for Progress), the message, an optional action and a close button. Render it
 * inside <ToastProvider>, or use useToast().show().
 */
export function Toast({
  kind = "success",
  message,
  action,
  actionAltText,
  onAction,
  closeLabel,
  duration,
  className,
  ...props
}: ToastProps) {
  const sticky = kind === "error" || kind === "progress";
  const showAction = kind !== "progress" && action !== undefined && action !== null && action !== false;
  const altText = actionAltText ?? (typeof action === "string" ? action : "");
  return (
    <ToastPrimitive.Root
      data-theme="dark"
      data-kind={kind}
      type={kind === "error" ? "foreground" : "background"}
      duration={duration ?? (sticky ? Number.POSITIVE_INFINITY : TOAST_DURATION_MS)}
      className={cn(
        "flex w-max max-w-full items-center gap-3 rounded-pill bg-surface py-3 pr-3 pl-4 text-fg-primary shadow-float",
        className,
      )}
      {...props}
    >
      {kind === "progress" ? (
        <Spinner size="md" className="text-fg-accent" />
      ) : (
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-pill", DOT[kind])} />
      )}
      <ToastPrimitive.Description className="min-w-0 type-body-s">{message}</ToastPrimitive.Description>
      {showAction ? (
        <ToastPrimitive.Action altText={altText} asChild>
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 cursor-pointer rounded-sm type-label-m text-fg-accent outline-none hover:underline focus-visible:shadow-focus"
          >
            {action}
          </button>
        </ToastPrimitive.Action>
      ) : null}
      <ToastPrimitive.Close
        aria-label={closeLabel}
        className="flex shrink-0 cursor-pointer items-center justify-center rounded-pill outline-none focus-visible:shadow-focus"
      >
        <Icon name="close" className="size-4.5 opacity-60" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
