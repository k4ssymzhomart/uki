"use client";

import { Icon, Popover, PopoverAnchor, PopoverInfo, PopoverTrigger, StatTile } from "@uki/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser.ts";
import { AppLink } from "../shell/app-link.tsx";
import { NAV, NAV_HREFS } from "../shell/shell-model.ts";
import { type DataKept, loadDataKept } from "./data-kept.ts";

type State = { status: "idle" | "loading" | "failed" } | { status: "ready"; kept: DataKept };

export type DataKeptTileProps = {
  /** The exams the overview shows, whose stills and events are counted. */
  examIds: readonly string[];
};

/**
 * 0.1 Overview's fourth stat tile, Video uploaded, with 0.1b (Figma 84:5341): its label opens the
 * Popover/Info "Why 0 MB?" under the tile, which counts the stills in `frames` and the `events` rows of
 * the overview's exams on opening. "Open privacy centre" shows once A.5 (WP 1.12) has its page.
 */
export function DataKeptTile({ examIds }: DataKeptTileProps) {
  const t = useTranslations("dashboard.overview");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });
  const key = examIds.join(",");

  useEffect(() => {
    if (!open) return;
    let live = true;
    setState({ status: "loading" });
    loadDataKept(createSupabaseBrowserClient(), key === "" ? [] : key.split(","))
      .then((kept) => live && setState({ status: "ready", kept }))
      .catch(() => live && setState({ status: "failed" }));
    return () => {
      live = false;
    };
  }, [open, key]);

  const count = (pick: (kept: DataKept) => number) =>
    state.status === "ready" ? t("dataKept.count", { count: pick(state.kept) }) : t("dataKept.pending");
  // A failed count stays "—": the popover still explains why video is 0 MB.
  const video = t("stat.video.value", { megabytes: 0 });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <StatTile
          className="items-stretch"
          label={
            <PopoverTrigger className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm uppercase outline-none focus-visible:shadow-focus">
              {t("stat.video.label")}
              <Icon name="info" className="size-3.5" />
            </PopoverTrigger>
          }
          value={video}
          caption={t("stat.video.caption")}
        />
      </PopoverAnchor>
      <PopoverInfo
        side="bottom"
        align="end"
        title={t("dataKept.title")}
        body={t("dataKept.body")}
        rows={[
          { id: "video", label: t("dataKept.video"), value: video },
          { id: "frames", label: t("dataKept.frames"), value: count((kept) => kept.frames) },
          { id: "events", label: t("dataKept.events"), value: count((kept) => kept.events) },
        ]}
        footer={
          NAV.privacy.built ? (
            <AppLink
              href={NAV_HREFS.privacy}
              className="inline-flex items-center gap-1.5 rounded-sm outline-none type-label-m focus-visible:shadow-focus"
            >
              {t("dataKept.privacyCentre")}
              <Icon name="arrow-right" className="size-4" />
            </AppLink>
          ) : null
        }
      />
    </Popover>
  );
}
