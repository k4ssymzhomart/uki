"use client";

import { toMs } from "@uki/contracts";
import {
  Button,
  initials,
  RowAction,
  RowLobby,
  rowLobbyColumns,
  SearchField,
  StatTile,
  Tab,
  TabGroup,
  Table,
  TableHeaderCell,
  useToast,
} from "@uki/ui";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import stopwatchArt from "../../assets/uki-3d-stopwatch.png";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { formatGroupCodes, minutesUntil, timeOf } from "../../lib/format.ts";
import { useNow, useServerOffset } from "../../lib/use-now.ts";
import { PageHeader } from "../shell/page-header.tsx";
import { shortName } from "../wall/names.ts";
import { QuickMessage } from "../wall/quick-message.tsx";
import {
  beforeStart,
  canStartExam,
  defaultLobbyFilter,
  LOBBY_FILTERS,
  type LobbyExam,
  type LobbyFilter,
  type LobbyRole,
  type LobbyRow,
  type LobbySession,
  lobbyCounts,
  lobbyRows,
  type RosterEntry,
  type StepDetail,
  visibleRows,
} from "./lobby-model.ts";
import { useLobbySessions } from "./use-lobby-sessions.ts";

/** Resolves with an error; on success the action redirects to the live wall instead. */
export type StartExamAction = (input: {
  exam_id: string;
}) => Promise<{ error: "alreadyStarted" | "forbidden" | "failed" } | undefined>;

export type LobbyViewProps = {
  exam: LobbyExam;
  roster: readonly RosterEntry[];
  sessions: readonly LobbySession[];
  who: LobbyRole;
  /** The server's clock when the page rendered. */
  nowMs: number;
  startAction: StartExamAction;
  /** Server clock minus this browser's (lib/use-now.ts); tests pass a fake. Must be stable. */
  measureOffset?: () => Promise<number | null>;
};

const CLOCK_TICK_MS = 15_000;

/**
 * 1.5 Lobby (Figma 51:2066): the start banner with Message everyone and Start exam, the four stat cards
 * and the check-in table with tabs and search, kept live from the exam channel. Call stays hidden in
 * Phase 0.
 */
export function LobbyView({
  exam,
  roster,
  sessions: initialSessions,
  who,
  nowMs,
  startAction,
  measureOffset,
}: LobbyViewProps) {
  const t = useTranslations("dashboard");
  const locale = useDashboardLocale();
  const toast = useToast();
  // The banner and the Start exam gate run on the server's clock, like start_exam.
  const now = useNow(nowMs, CLOCK_TICK_MS, useServerOffset(measureOffset));
  const sessions = useLobbySessions(exam.id, initialSessions);
  const rows = lobbyRows(roster, sessions);
  const counts = lobbyCounts(rows, roster);
  const [filter, setFilter] = useState<LobbyFilter>(() => defaultLobbyFilter(counts));
  const [query, setQuery] = useState("");
  const [starting, startTransition] = useTransition();
  const visible = visibleRows(rows, filter, query);

  const groupsLabel =
    exam.groups.length > 0
      ? t("common.groups", { count: exam.groups.length, codes: formatGroupCodes(exam.groups) })
      : exam.title;
  const startsAt = toMs(exam.starts_at);
  const overline = beforeStart(exam, now)
    ? t("lobby.banner.startsAt", { time: timeOf(startsAt), minutes: minutesUntil(startsAt, now) })
    : t("lobby.banner.started", { time: timeOf(startsAt) });

  const start = () =>
    startTransition(async () => {
      const result = await startAction({ exam_id: exam.id });
      if (result) toast.show({ kind: "error", message: t(`lobby.startError.${result.error}`) });
    });

  const detailText = (detail: StepDetail | null): string | undefined => {
    if (!detail) return undefined;
    switch (detail.key) {
      case "appOpen":
        return t("lobby.detail.appOpen", { app: detail.app });
      case "cardRetry":
        return t("lobby.detail.cardRetry", { attempt: detail.attempt, max: detail.max });
      default:
        return t(`lobby.detail.${detail.key}`);
    }
  };

  const action = (row: LobbyRow) =>
    row.sessionId !== null && row.category !== "done" ? (
      <QuickMessage
        target={{ scope: "student", sessionId: row.sessionId, name: shortName(row.name) }}
        trigger={<RowAction icon="message">{t("lobby.message")}</RowAction>}
        align="end"
      />
    ) : undefined;

  return (
    <>
      <PageHeader
        breadcrumb={t("lobby.breadcrumb", { exam: exam.title, groups: groupsLabel })}
        title={t("lobby.title")}
      />
      <main className="flex flex-col gap-5 px-8 pt-6.5 pb-7">
        <section className="flex items-center gap-4.5 overflow-clip rounded-card bg-brand-subtle px-4.5 py-3.5">
          <Image src={stopwatchArt} alt="" className="size-18 shrink-0 object-contain" />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <p className="opacity-62 type-mono-tag">{overline}</p>
            <h2 className="type-card-title">
              {t("lobby.banner.joined", { joined: counts.joined, total: counts.total })}
            </h2>
            {counts.needHelp + counts.notJoined > 0 ? (
              <p className="opacity-72 type-card-caption">
                {[
                  counts.needHelp > 0 ? t("lobby.banner.needHelp", { count: counts.needHelp }) : null,
                  counts.notJoined > 0 ? t("lobby.banner.notJoined", { count: counts.notJoined }) : null,
                ]
                  .filter((sentence) => sentence !== null)
                  .join(" ")}
              </p>
            ) : null}
          </div>
          <QuickMessage
            target={{ scope: "group", examId: exam.id, label: groupsLabel }}
            trigger={<Button variant="ghost">{t("lobby.messageEveryone")}</Button>}
            align="end"
          />
          <Button onClick={start} loading={starting} disabled={!canStartExam(exam, who, now)}>
            {t("lobby.startExam")}
          </Button>
        </section>

        <div className="grid grid-cols-4 gap-4">
          <StatTile
            label={t("lobby.stat.joined.label")}
            value={counts.joined}
            caption={t("lobby.stat.joined.caption", { total: counts.total })}
          />
          <StatTile
            label={t("lobby.stat.ready.label")}
            value={counts.ready}
            caption={t("lobby.stat.ready.caption")}
          />
          <StatTile
            label={t("lobby.stat.needHelp.label")}
            value={counts.needHelp}
            caption={t("lobby.stat.needHelp.caption")}
          />
          <StatTile
            label={t("lobby.stat.notJoined.label")}
            value={counts.notJoined}
            caption={t("lobby.stat.notJoined.caption", { count: counts.invitesOpened })}
          />
        </div>

        <section
          aria-labelledby="check-in-title"
          className="overflow-clip rounded-card border border-line-default bg-surface"
        >
          <div className="flex items-center gap-3 py-3.5 pr-4 pl-5">
            <h2 id="check-in-title" className="type-card-title">
              {t("lobby.table.title")}
            </h2>
            <TabGroup
              value={filter}
              onValueChange={(value) => setFilter(value as LobbyFilter)}
              aria-label={t("lobby.table.filterLabel")}
              variant="plain"
            >
              {LOBBY_FILTERS.map((id) => (
                <Tab key={id} value={id}>
                  {id === "all"
                    ? t("lobby.table.filter.all")
                    : t(`lobby.table.filter.${id}`, { count: counts[id] })}
                </Tab>
              ))}
            </TabGroup>
            <span aria-hidden="true" className="min-w-0 flex-1" />
            <SearchField
              label={t("lobby.table.search")}
              placeholder={t("lobby.table.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-60"
            />
          </div>
          <Table>
            <thead>
              <tr className="bg-subtle">
                <TableHeaderCell
                  className={`${rowLobbyColumns.student} h-8.25 py-0`}
                  label={t("lobby.column.student")}
                />
                <TableHeaderCell
                  className={`${rowLobbyColumns.step} h-8.25 py-0`}
                  label={t("lobby.column.where")}
                />
                <TableHeaderCell
                  className={`${rowLobbyColumns.device} h-8.25 py-0`}
                  label={t("lobby.column.device")}
                />
                <TableHeaderCell
                  className={`${rowLobbyColumns.status} h-8.25 py-0`}
                  label={t("lobby.column.status")}
                />
                <TableHeaderCell
                  className="h-8.25 py-0"
                  label={<span className="sr-only">{t("lobby.column.action")}</span>}
                />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <RowLobby
                  key={row.studentId}
                  data-category={row.category}
                  initials={initials(row.name, locale)}
                  name={row.name}
                  studentId={row.number}
                  step={t(`lobby.step.${row.step}`)}
                  stepDetail={detailText(row.detail)}
                  device={
                    row.device
                      ? t("lobby.device", { os: t(`lobby.os.${row.device.os}`), version: row.device.version })
                      : t("lobby.noDevice")
                  }
                  status={row.chip.status}
                  statusLabel={t(`lobby.chip.${row.chip.key}`)}
                  action={action(row)}
                />
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center opacity-58 type-body-s">
                    {t("lobby.table.empty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </section>
      </main>
    </>
  );
}
