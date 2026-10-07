"use client";

import type { CompactEvent } from "@uki/contracts";
import { formatTime } from "@uki/i18n";
import { EventRow } from "@uki/ui";
import { useTranslations } from "next-intl";
import { formatGroupCodes } from "../../lib/format.ts";
import { lookAwayRepeat } from "./event-copy.ts";
import { shortName } from "./names.ts";
import { isGroupEvent, selectFeed } from "./tiles.ts";
import { useEventCopy } from "./use-event-copy.ts";
import { useWall } from "./wall-store-context.tsx";

function FeedRow({ event }: { event: CompactEvent }) {
  const t = useTranslations("dashboard.wall");
  const common = useTranslations("dashboard.common");
  const { describe, text } = useEventCopy();
  const group = isGroupEvent(event);
  const groups = useWall((state) => state.exam.groups);
  const codes = formatGroupCodes(groups);
  const student = useWall((state) => {
    const session = state.sessions[event.session_id];
    const student = session === undefined ? undefined : state.students[session.studentId];
    return shortName(student?.fullName ?? "");
  });
  const name = group ? common("groups", { count: groups.length, codes }) : student;
  const sessionEvents = useWall((state) => state.events[event.session_id]);
  const copy = describe(event);
  const detail = lookAwayRepeat(event, sessionEvents ?? []) ?? copy.detail;
  return (
    <EventRow
      kind={copy.kind}
      time={formatTime(event.at, "en", { seconds: true })}
      dateTime={event.at}
      title={t("feed.row", { name, event: text(copy.feed ?? copy.title) })}
      detail={detail === undefined ? undefined : text(detail)}
    />
  );
}

/**
 * The Live events column of 2.4: flag and log events, newest first, at most 100, in two columns
 * filled top to bottom as Figma lays them out.
 */
export function LiveEvents() {
  const t = useTranslations("dashboard.wall.feed");
  const feed = useWall(selectFeed);
  const half = Math.ceil(feed.length / 2);
  const columns = [
    { id: "first", events: feed.slice(0, half) },
    { id: "second", events: feed.slice(half) },
  ];
  return (
    <section
      aria-label={t("title")}
      className="flex w-full flex-col gap-1 overflow-clip rounded-card border border-line-default bg-surface px-5 pt-4 pb-2.5 text-fg-primary"
    >
      <h2 className="type-card-title">{t("title")}</h2>
      <div className="grid w-full grid-cols-1 gap-x-8 lg:grid-cols-2">
        {columns.map((column) => (
          <ol key={column.id} className="flex min-w-0 flex-col">
            {column.events.map((event) => (
              <li key={event.id}>
                <FeedRow event={event} />
              </li>
            ))}
          </ol>
        ))}
      </div>
    </section>
  );
}
