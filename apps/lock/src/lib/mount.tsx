import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";

/** Renders an extension page into its #root. */
export function mount(node: ReactNode): void {
  const root = document.getElementById("root");
  if (!root) throw new Error("the page has no #root");
  createRoot(root).render(<StrictMode>{node}</StrictMode>);
}
