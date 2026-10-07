import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { icons } from "../icons.ts";
import { StatusDot, type StatusDotTone } from "../proctoring/status-dot.tsx";

export interface LockPopupFooterProps extends Omit<ComponentProps<"footer">, "children"> {
  /** Link status with the Üki app, for example "Üki app · connected · camera on". */
  text: ReactNode;
  /** Show dot (Figma property). */
  showDot?: boolean;
  /** ok when the app is connected (Figma); warn or flag while it is not. */
  dotTone?: Extract<StatusDotTone, "ok" | "warn" | "flag">;
}

/** Bottom of every Üki Lock popup: link status with the desktop app (Figma Ext/Popup footer 92:2546). */
export function LockPopupFooter({
  text,
  showDot = true,
  dotTone = "ok",
  className,
  ...props
}: LockPopupFooterProps) {
  const Laptop = icons.laptop;
  return (
    <footer
      className={cn("flex w-full items-center gap-2 bg-subtle px-4 py-2.5 text-fg-primary", className)}
      {...props}
    >
      <Laptop aria-hidden="true" className="size-3.5 shrink-0 text-icon-primary" />
      <p role="status" className="type-ui-caption min-w-0 flex-1 opacity-70">
        {text}
      </p>
      {showDot ? <StatusDot tone={dotTone} className="size-2" /> : null}
    </footer>
  );
}
