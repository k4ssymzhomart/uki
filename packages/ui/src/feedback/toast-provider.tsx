import { Toast as ToastPrimitive } from "radix-ui";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { cn } from "../cn.ts";
import { Toast } from "./toast.tsx";
import { type ToastApi, ToastContext, type ToastOptions } from "./toast-context.ts";

type ToastEntry = ToastOptions & { id: string; open: boolean };

export type ToastProviderProps = {
  children: ReactNode;
  /** Accessible name of the toast region, for example "Notifications". */
  label: string;
  /** Accessible name of every toast's close button, for example "Close". */
  closeLabel: string;
  /** Classes for the viewport: bottom-centre, 24 px from the bottom edge by default. */
  viewportClassName?: string;
};

/**
 * Holds the toast queue and the bottom-centre viewport. Wrap the app once; then call
 * useToast().show({ kind, message, action, onAction }) anywhere below.
 */
export function ToastProvider({ children, label, closeLabel, viewportClassName }: ToastProviderProps) {
  const [entries, setEntries] = useState<ToastEntry[]>([]);
  const counter = useRef(0);

  const show = useCallback((options: ToastOptions) => {
    counter.current += 1;
    const id = options.id ?? `toast-${counter.current}`;
    setEntries((previous) => [
      ...previous.filter((entry) => entry.id !== id),
      { ...options, id, open: true },
    ]);
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setEntries((previous) => previous.filter((entry) => entry.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider label={label} swipeDirection="down">
        {children}
        {entries.map(({ id, open, ...options }) => (
          <Toast
            key={id}
            open={open}
            onOpenChange={(next) => {
              if (!next) dismiss(id);
            }}
            closeLabel={closeLabel}
            {...options}
          />
        ))}
        <ToastPrimitive.Viewport
          className={cn(
            "fixed bottom-6 left-1/2 z-50 flex max-w-full -translate-x-1/2 flex-col items-center gap-2 px-4 outline-none",
            viewportClassName,
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
