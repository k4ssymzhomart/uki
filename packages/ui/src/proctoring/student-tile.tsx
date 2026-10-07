import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { Face } from "../art/face.tsx";
import type { FaceState } from "../art/faces.ts";
import { cn } from "../cn.ts";
import { StatusDot, type StatusDotTone } from "./status-dot.tsx";

export const STUDENT_TILE_STATES = ["ok", "warn", "flag", "paused"] as const;
export type StudentTileState = (typeof STUDENT_TILE_STATES)[number];

const FACE: Record<StudentTileState, FaceState> = {
  ok: "neutral",
  warn: "alert",
  flag: "flag",
  paused: "sleeping",
};

const DOT: Record<StudentTileState, StatusDotTone> = {
  ok: "ok",
  warn: "warn",
  flag: "flag",
  paused: "idle",
};

const studentTile = cva(
  [
    "flex w-68 cursor-pointer items-center gap-3 rounded-card bg-surface py-3 pr-4 pl-3 text-left text-fg-primary",
    "outline-none focus-visible:shadow-focus disabled:cursor-default",
  ],
  {
    variants: {
      state: {
        ok: "",
        warn: "",
        flag: "inset-ring-2 inset-ring-flag",
        paused: "",
      },
    },
    defaultVariants: { state: "ok" },
  },
);

export interface StudentTileProps extends Omit<ComponentProps<"button">, "children" | "name"> {
  /** ok, warn, flag or paused (Figma 15:1372). The live wall maps its tile states onto these. */
  state?: StudentTileState;
  /** Student name, for example "Aigerim S.". */
  name: ReactNode;
  /** Status line, for example "phone 0.94 · 10:47". */
  detail: ReactNode;
  /** Screen-reader text for the state, for example "Flagged"; the face and dot only show it visually. */
  stateLabel?: ReactNode;
}

/**
 * One student on the live wall. A button, so it can be the trigger of TileActionsMenu.
 * The wall renders under data-theme="dark", as in Figma.
 */
export function StudentTile({
  state = "ok",
  name,
  detail,
  stateLabel,
  className,
  type = "button",
  ...props
}: StudentTileProps) {
  return (
    <button type={type} data-tile-state={state} className={cn(studentTile({ state }), className)} {...props}>
      <Face state={FACE[state]} className="size-11" />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 overflow-hidden whitespace-nowrap">
        <span className="type-label-m-strong max-w-full truncate">{name}</span>
        <span className="type-ui-mono max-w-full truncate">{detail}</span>
      </span>
      {stateLabel ? <span className="sr-only">{stateLabel}</span> : null}
      <StatusDot tone={DOT[state]} className="size-2.25" />
    </button>
  );
}
