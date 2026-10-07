"use client";

import { Button, Tab, TabGroup } from "@uki/ui";
import { useTranslations } from "next-intl";
import { formatGroupCodes } from "../../lib/format.ts";
import { ExtendTime } from "./extend-time.tsx";
import { QuickMessage } from "./quick-message.tsx";
import { selectCounts } from "./tiles.ts";
import { useWall } from "./wall-store-context.tsx";

/** Flags first (default) and Seat order sort the wall; the Paused chip filters it. */
export type WallView = "flags" | "seat" | "paused";

export function isWallView(value: string): value is WallView {
  return value === "flags" || value === "seat" || value === "paused";
}

/** 2.4's toolbar: sort and filter tabs, Message group (2.4b) and Extend time (2.4c). */
export function WallToolbar({
  view,
  onViewChange,
}: {
  view: WallView;
  onViewChange: (view: WallView) => void;
}) {
  const t = useTranslations("dashboard.wall");
  const common = useTranslations("dashboard.common");
  const paused = useWall((state) => selectCounts(state).paused);
  const examId = useWall((state) => state.exam.id);
  const groups = useWall((state) => formatGroupCodes(state.exam.groups));
  const groupCount = useWall((state) => state.exam.groups.length);

  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <TabGroup
        aria-label={t("sort.label")}
        value={view}
        onValueChange={(next) => {
          if (isWallView(next)) onViewChange(next);
        }}
      >
        <Tab value="flags">{t("sort.flags")}</Tab>
        <Tab value="seat">{t("sort.seat")}</Tab>
        <Tab value="paused">{t("filter.paused", { count: paused })}</Tab>
      </TabGroup>
      <span aria-hidden="true" className="min-w-0 flex-1" />
      <QuickMessage
        target={{ scope: "group", examId, label: common("groups", { count: groupCount, codes: groups }) }}
        trigger={<Button variant="ghost">{t("messageGroup")}</Button>}
      />
      <ExtendTime examId={examId} trigger={<Button variant="secondary">{t("extendTime")}</Button>} />
    </div>
  );
}
