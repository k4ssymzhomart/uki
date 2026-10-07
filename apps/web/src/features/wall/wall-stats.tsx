"use client";

import type { TileCounts } from "@uki/contracts";
import { StatTile } from "@uki/ui";
import { useTranslations } from "next-intl";
import { selectCounts } from "./tiles.ts";
import { useWallWith } from "./wall-store-context.tsx";

function sameCounts(a: TileCounts, b: TileCounts): boolean {
  return (
    a.onScreen === b.onScreen &&
    a.writing === b.writing &&
    a.warnings === b.warnings &&
    a.flagged === b.flagged &&
    a.paused === b.paused
  );
}

/** The four stat cards of 2.4: On screen of all writing, Warnings, Flagged, Paused. */
export function WallStats() {
  const t = useTranslations("dashboard.wall.stat");
  const counts = useWallWith(selectCounts, sameCounts);
  return (
    <div className="grid w-full grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile
        label={t("onScreen.label")}
        value={counts.onScreen}
        caption={t("onScreen.caption", { writing: counts.writing })}
      />
      <StatTile label={t("warnings.label")} value={counts.warnings} caption={t("warnings.caption")} />
      <StatTile label={t("flagged.label")} value={counts.flagged} caption={t("flagged.caption")} />
      <StatTile label={t("paused.label")} value={counts.paused} caption={t("paused.caption")} />
    </div>
  );
}
