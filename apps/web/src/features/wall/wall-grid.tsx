"use client";

import { useTranslations } from "next-intl";
import { type OrderOptions, selectOrder } from "./tiles.ts";
import { useWallWith } from "./wall-store-context.tsx";
import { WallTile } from "./wall-tile.tsx";

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * The tiles in wall order. The grid re-renders only when the order changes; each tile follows its own
 * slice. Columns are at least 271 px wide, so 1440 px fits Figma's four.
 */
export function WallGrid({
  options,
  onOpenTimeline,
}: {
  options: OrderOptions;
  onOpenTimeline: (sessionId: string) => void;
}) {
  const t = useTranslations("dashboard.wall");
  const ids = useWallWith((state) => selectOrder(state, options), sameIds);
  return (
    <ul
      aria-label={t("grid.label")}
      className="grid w-full grid-cols-[repeat(auto-fill,minmax(--spacing(67.75),1fr))] gap-3"
    >
      {ids.map((id) => (
        <li key={id} className="flex min-w-0">
          <WallTile sessionId={id} onOpenTimeline={onOpenTimeline} />
        </li>
      ))}
    </ul>
  );
}
