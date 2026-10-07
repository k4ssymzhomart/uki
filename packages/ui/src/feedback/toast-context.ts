import { createContext, type ReactNode, useContext } from "react";
import type { ToastKind } from "./toast.tsx";

export type ToastOptions = {
  /** Reuse an id to replace a toast in place, for example a Progress toast that becomes Success. */
  id?: string;
  kind?: ToastKind;
  message: ReactNode;
  action?: ReactNode;
  actionAltText?: string;
  onAction?: () => void;
  /** Milliseconds; defaults to 4 s, and to "until closed" for Error and Progress. */
  duration?: number;
};

export type ToastApi = {
  /** Shows a toast and returns its id. */
  show: (options: ToastOptions) => string;
  /** Closes the toast with this id. */
  dismiss: (id: string) => void;
};

export const ToastContext = createContext<ToastApi | null>(null);

/** show() and dismiss() for toasts; needs a <ToastProvider> above. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error("useToast needs a <ToastProvider> above it");
  return api;
}
