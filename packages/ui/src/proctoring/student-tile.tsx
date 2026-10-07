import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { Face } from "../art/face.tsx";
import type { FaceState } from "../art/faces.ts";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
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
    "group flex w-68 cursor-pointer items-center gap-3 rounded-card bg-surface py-3 pr-4 pl-3 text-left text-fg-primary",
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
  /**
   * Drawn in place of the status dot while the tile is hovered, has keyboard focus or its menu is open
   * (the trigger's data-state=open), as 2.4a's ⋯ button (Figma 85:6504): pass <StudentTileMore />.
   * Decorative, because the whole tile is the button.
   */
  trailing?: ReactNode;
}

/** The ⋯ "More" button of an open or hovered tile (Figma 85:6552): bg-subtle, 6 px padding, 18 px icon. */
export function StudentTileMore({ className, ...props }: Omit<ComponentProps<"span">, "children">) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[calc(var(--radius-sm)-var(--spacing)/2)] bg-subtle p-1.5",
        className,
      )}
      {...props}
    >
      <Icon name="more" className="size-4.5" />
    </span>
  );
}

/** Shows the trailing slot, and hides the dot, on hover, keyboard focus and an open menu. */
const SHOW_TRAILING = "hidden group-hover:flex group-focus-visible:flex group-data-[state=open]:flex";
const HIDE_DOT = "group-hover:hidden group-focus-visible:hidden group-data-[state=open]:hidden";

/**
 * One student on the live wall. A button, so it can be the trigger of TileActionsMenu.
 * The wall renders under data-theme="dark", as in Figma.
 */
export function StudentTile({
  state = "ok",
  name,
  detail,
  stateLabel,
  trailing,
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
      <StatusDot tone={DOT[state]} className={cn("size-2.25", trailing ? HIDE_DOT : undefined)} />
      {trailing ? (
        // -mr-1.75: Figma puts the 30 px button 9 px from the tile's edge, the dot 16 px.
        <span aria-hidden="true" className={cn("-mr-1.75 shrink-0", SHOW_TRAILING)}>
          {trailing}
        </span>
      ) : null}
    </button>
  );
}
