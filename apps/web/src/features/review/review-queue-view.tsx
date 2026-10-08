"use client";

import { formatTime } from "@uki/i18n";
import {
  type ChipStatus,
  Count,
  cn,
  DropdownFilter,
  FlagPreview,
  Icon,
  initials,
  RowAction,
  RowSession,
  rowSessionColumns,
  SearchField,
  StatTile,
  shortName,
  Tab,
  TabGroup,
  Table,
  TableHeaderCell,
} from "@uki/ui";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { type ReactElement, useState } from "react";
import reportArt from "../../assets/uki-3d-report.png";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { timeOf } from "../../lib/format.ts";
import { AppLink } from "../shell/app-link.tsx";
import { PageHeader } from "../shell/page-header.tsx";
import { EVENT_KIND } from "../wall/event-copy.ts";
import { useFunctionsClient } from "../wall/use-command.ts";
import { useStills } from "../wall/use-stills.ts";
import { durationMessage, flagChip, flagTypeLabel, type ReviewMessage, topFlagLine } from "./review-copy.ts";
import {
  countFor,
  type FlagType,
  filterGroups,
  flagParam,
  flagTypeCounts,
  REVIEW_TABS,
  type ReviewExam,
  type ReviewGroup,
  type ReviewSession,
  type ReviewTab,
  reviewStats,
  tabCounts,
} from "./review-model.ts";
import { useEventCopy } from "./use-review-copy.ts";

export type ReviewQueueViewProps = {
  groups: readonly ReviewGroup[];
  /** Flag types from `?flag=` when the page rendered. */
  initialFlags: readonly FlagType[];
  /** The server's clock when the page rendered. */
  nowMs: number;
};

const STATUS_CHIP: Record<ReviewSession["status"], ChipStatus> = {
  to_review: "warn",
  reviewed: "ok",
  no_flags: "idle",
};

/** Writes `?flag=` without a server round trip (Next.js keeps useSearchParams in step). */
function replaceFlagParam(types: readonly FlagType[]): void {
  const url = new URL(window.location.href);
  const value = flagParam(types);
  if (value === null) url.searchParams.delete("flag");
  else url.searchParams.set("flag", value);
  window.history.replaceState(window.history.state, "", url);
}

/** "History of Kazakhstan · Test · finished 12:00", "Physics 1 · Quiz 3 · live now". */
export function useExamLine(): (exam: ReviewExam) => string {
  const t = useTranslations("dashboard.review");
  return (exam) =>
    t("examLine", {
      exam: exam.title,
      state: exam.status === "live" ? "live" : "done",
      time: timeOf(exam.endsAt),
    });
}

/** 3.2b: the row's flags cell opens a hover card with the top flag's first still (5-minute URL, audited). */
function FlagsPreview({ session, flags }: { session: ReviewSession; flags: ReactElement }) {
  const t = useTranslations("dashboard.review");
  const { describe, text } = useEventCopy();
  const getClient = useFunctionsClient();
  const [open, setOpen] = useState(false);
  const flag = session.top;
  const stills = useStills({
    eventId: open && flag !== null ? flag.id : null,
    frameCount: flag?.frame_count ?? 0,
    confirmed: 0,
    getClient,
  });
  if (flag === null) return flags;
  const copy = describe(flag);
  const chip = flagChip(flag);
  const still = stills.stills[0];
  const href = `/review/${session.id}`;
  const time = formatTime(flag.at, "en", { seconds: true });
  return (
    <FlagPreview
      open={open}
      onOpenChange={setOpen}
      trigger={
        <AppLink href={href} className="block rounded-sm outline-none focus-visible:shadow-focus">
          {flags}
        </AppLink>
      }
      image={
        still === undefined ? undefined : (
          // biome-ignore lint/performance/noImgElement: signed 5-minute URLs must not pass through the Next.js image cache
          <img src={still.url} alt={t("preview.still", { time })} className="size-full object-cover" />
        )
      }
      chipLabel={chip === undefined ? text(copy.title) : t(chip.key, chip.values)}
      chipStatus={EVENT_KIND[flag.type] === "flag" ? "flag" : "warn"}
      time={time}
      dateTime={flag.at}
      title={t("preview.title", { name: shortName(session.name), what: text(copy.feed ?? copy.title) })}
      detail={copy.detail === undefined ? undefined : text(copy.detail)}
      link={
        <RowAction icon="arrow-right" iconPosition="end" asChild>
          <AppLink href={href}>{t("preview.open")}</AppLink>
        </RowAction>
      }
    />
  );
}

function SessionRow({ session }: { session: ReviewSession }) {
  const t = useTranslations("dashboard");
  const locale = useDashboardLocale();
  const line = topFlagLine(session);
  const count = countFor(session);
  const severe = session.top !== null && EVENT_KIND[session.top.type] === "flag";
  const statusKey =
    session.status === "reviewed" ? (session.decision?.decision ?? "no_issue") : session.status;
  const render = (message: ReviewMessage) => t(`review.${message.key}`, message.values);
  return (
    <RowSession
      data-session-id={session.id}
      initials={initials(session.name, locale)}
      name={session.name}
      studentId={session.number}
      flagCount={count}
      flagTone={session.flags.length === 0 ? "neutral" : count >= 2 || severe ? "flag" : "warn"}
      topFlag={line === undefined ? undefined : render(line)}
      duration={
        session.minutes === null ? t("review.row.noTime") : t("common.minutes", { minutes: session.minutes })
      }
      status={STATUS_CHIP[session.status]}
      statusLabel={t(`review.status.${statusKey}`)}
      renderFlags={
        session.flags.length === 0 ? undefined : (flags) => <FlagsPreview session={session} flags={flags} />
      }
      action={
        session.flags.length === 0 ? undefined : (
          <RowAction icon="arrow-right" iconPosition="end" asChild>
            <AppLink href={`/review/${session.id}`}>{t("review.row.review")}</AppLink>
          </RowAction>
        )
      }
    />
  );
}

/**
 * 3.2 Review queue (Figma 51:2092) with the flag-type filter (3.2a, 87:8275) and the flag preview
 * (3.2b, 87:8524): the stat cards, "Flag ≠ fail." and the sessions grouped by exam, To review first.
 * The tab and the search run on the client; the flag filter is kept in `?flag=`.
 */
export function ReviewQueueView({ groups, initialFlags, nowMs }: ReviewQueueViewProps) {
  const t = useTranslations("dashboard.review");
  const examLine = useExamLine();
  const [tab, setTab] = useState<ReviewTab>("to_review");
  const [query, setQuery] = useState("");
  const [flags, setFlags] = useState<readonly FlagType[]>(initialFlags);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<readonly FlagType[]>(initialFlags);

  const stats = reviewStats(groups, nowMs);
  const counts = tabCounts(groups);
  const visible = filterGroups(groups, { tab, flags, query });
  const typeCounts = flagTypeCounts(groups, tab, query);
  const listed = [
    ...typeCounts,
    ...draft.filter((type) => !typeCounts.some((c) => c.type === type)).map((type) => ({ type, count: 0 })),
  ];
  const chosen = draft.length === 0 ? listed.map((c) => c.type) : draft;
  const showCount = listed.filter((c) => chosen.includes(c.type)).reduce((sum, c) => sum + c.count, 0);
  const render = (message: ReviewMessage) => t(message.key, message.values);

  const only = groups.length === 1 ? groups[0] : undefined;
  const breadcrumb =
    only !== undefined
      ? t("breadcrumb.exam", { exam: examLine(only.exam) })
      : groups.length > 1
        ? t("breadcrumb.exams", { count: groups.length })
        : t("breadcrumb.root");

  const openFilter = (next: boolean) => {
    setFilterOpen(next);
    if (next) setDraft(flags);
  };
  const apply = (types: readonly FlagType[]) => {
    setFlags(types);
    replaceFlagParam(types);
    setFilterOpen(false);
  };

  return (
    <>
      <PageHeader breadcrumb={breadcrumb} title={t("title")} />
      <main className="flex flex-col gap-5 px-8 pt-6.5 pb-7">
        <div className="grid grid-cols-4 gap-4">
          <StatTile
            label={t("stat.toReview.label")}
            value={stats.toReview.sessions}
            caption={t("stat.toReview.caption", { count: stats.toReview.flags })}
          />
          <StatTile
            label={t("stat.reviewed.label")}
            value={stats.reviewed.sessions}
            caption={
              stats.reviewed.sessions === 0
                ? t("stat.reviewed.none")
                : t("stat.reviewed.caption", {
                    when: stats.reviewed.today ? "today" : "earlier",
                    count: stats.reviewed.reviewers,
                  })
            }
          />
          <StatTile
            label={t("stat.noFlags.label")}
            value={stats.noFlags}
            caption={t("stat.noFlags.caption")}
          />
          <StatTile
            label={t("stat.median.label")}
            value={
              stats.medianReviewS === null
                ? t("stat.median.none")
                : render(durationMessage(stats.medianReviewS))
            }
            caption={t("stat.median.caption")}
          />
        </div>

        <section className="flex items-center gap-3.5 overflow-clip rounded-card bg-brand-subtle py-2.5 pr-5 pl-3.5">
          <Image src={reportArt} alt="" className="size-13 shrink-0 object-contain" />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-px">
            <h2 className="type-card-title">{t("principle.title")}</h2>
            <p className="opacity-72 type-card-caption">{t("principle.body")}</p>
          </div>
        </section>

        <section
          aria-labelledby="review-sessions-title"
          className="overflow-clip rounded-card border border-line-default bg-surface"
        >
          <div className="flex items-center gap-3 py-3.5 pr-4 pl-5">
            <h2 id="review-sessions-title" className="type-card-title">
              {t("sessions.title")}
            </h2>
            <TabGroup
              value={tab}
              onValueChange={(value) => setTab(value as ReviewTab)}
              aria-label={t("tabs.label")}
              variant="plain"
            >
              {REVIEW_TABS.map((id) => (
                <Tab key={id} value={id}>
                  {t(`tab.${id}`, { count: counts[id] })}
                </Tab>
              ))}
            </TabGroup>
            <span aria-hidden="true" className="min-w-0 flex-1" />
            <DropdownFilter
              open={filterOpen}
              onOpenChange={openFilter}
              trigger={
                <button
                  type="button"
                  className={cn(
                    "inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-pill bg-subtle py-2.25 pl-3.5 text-fg-primary outline-none type-label-m hover:bg-hover focus-visible:shadow-focus",
                    flags.length > 0 ? "pr-2.5" : "pr-4",
                  )}
                >
                  <Icon name="filter" className="size-4.5" />
                  {t("filter.button")}
                  {flags.length > 0 ? <Count>{flags.length}</Count> : null}
                </button>
              }
              header={t("filter.header")}
              options={listed.map((c) => ({
                id: c.type,
                label: render(flagTypeLabel(c.type)),
                count: c.count,
                checked: draft.includes(c.type),
              }))}
              onCheckedChange={(id, checked) =>
                setDraft((current) =>
                  checked
                    ? [...current.filter((type) => type !== id), id as FlagType]
                    : current.filter((type) => type !== id),
                )
              }
              clearLabel={t("filter.clear")}
              onClear={() => setDraft([])}
              applyLabel={t("filter.show", { count: showCount })}
              onApply={() => apply(draft)}
            />
            <SearchField
              label={t("search.label")}
              placeholder={t("search.label")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-60"
            />
          </div>
          <Table>
            <thead>
              <tr className="bg-subtle">
                <TableHeaderCell
                  className={`${rowSessionColumns.student} h-8.25 py-0`}
                  label={t("column.student")}
                />
                <TableHeaderCell
                  className={`${rowSessionColumns.flags} h-8.25 py-0`}
                  label={t("column.flags")}
                />
                <TableHeaderCell
                  className={`${rowSessionColumns.duration} h-8.25 py-0`}
                  label={t("column.time")}
                />
                <TableHeaderCell
                  className={`${rowSessionColumns.status} h-8.25 py-0`}
                  label={t("column.status")}
                />
                <TableHeaderCell
                  className="h-8.25 py-0"
                  label={<span className="sr-only">{t("column.open")}</span>}
                />
              </tr>
            </thead>
            {visible.map((group) => (
              <tbody key={group.exam.id} data-exam-id={group.exam.id}>
                {visible.length > 1 ? (
                  <tr className="border-b border-line-default bg-canvas">
                    <th
                      colSpan={5}
                      scope="colgroup"
                      className="py-2.5 pl-5 text-left font-normal type-label-m"
                    >
                      {examLine(group.exam)}
                    </th>
                  </tr>
                ) : null}
                {group.sessions.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </tbody>
            ))}
            {visible.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center opacity-58 type-body-s">
                    {tab === "to_review" && flags.length === 0 && query.trim() === ""
                      ? t("empty.to_review")
                      : t("empty.filtered")}
                  </td>
                </tr>
              </tbody>
            ) : null}
          </Table>
        </section>
      </main>
    </>
  );
}
