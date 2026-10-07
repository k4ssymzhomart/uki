import type { ComponentProps, ReactNode } from "react";
import { Face } from "../art/face.tsx";
import type { FaceState } from "../art/faces.ts";
import { cn } from "../cn.ts";
import { Badge, type BadgeTone } from "../data/badge.tsx";

export interface LockPopupHeaderProps extends Omit<ComponentProps<"header">, "children" | "title"> {
  /** The product name, "Üki Lock". */
  title: ReactNode;
  /** Badge label per state: "NOT PAIRED", "READY", "LOCKED", "DONE". */
  badge: ReactNode;
  /** neutral (not paired), brand (ready), ink (locked), ok (done). */
  badgeTone?: BadgeTone;
  face?: FaceState;
}

/** Top of every Üki Lock popup (Figma Ext/Popup header 92:2533). */
export function LockPopupHeader({
  title,
  badge,
  badgeTone = "brand",
  face = "neutral",
  className,
  ...props
}: LockPopupHeaderProps) {
  return (
    <header
      className={cn(
        "flex w-full items-center gap-2.5 border-line-default border-b py-3 pr-3.5 pl-4 text-fg-primary",
        className,
      )}
      {...props}
    >
      <Face state={face} className="size-6" />
      <h1 className="type-card-title min-w-0 flex-1">{title}</h1>
      <Badge tone={badgeTone}>{badge}</Badge>
    </header>
  );
}
