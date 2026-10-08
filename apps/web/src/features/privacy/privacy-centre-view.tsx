"use client";

import type { WorkspaceSettings } from "@uki/contracts";
import { Count, Icon, type IconName, Select, SelectItem, useToast } from "@uki/ui";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useId, useRef, useState, useTransition } from "react";
import laptopShieldArt from "../../assets/uki-3d-laptop-shield.png";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { timeOf } from "../../lib/format.ts";
import { type SaveSettingsResult, saveWorkspaceSettings } from "../settings/settings-actions.ts";
import { applyChange, RETENTION_OPTIONS, withCurrent } from "../settings/settings-model.ts";
import { PageHeader } from "../shell/page-header.tsx";
import { formatDayMonth } from "../students/student-format.ts";
import { useAuditText, WhoMark } from "./audit-text.tsx";
import { actOnRequest, type RequestAction, type RequestActionResult } from "./privacy-actions.ts";
import type { PrivacyCentreData, RequestDetail } from "./privacy-data.ts";
import { drawerHref, nextCleanup, type RequestRow, requestList } from "./privacy-model.ts";
import { RequestDrawer } from "./request-drawer.tsx";

export type PrivacyCentreViewProps = {
  data: PrivacyCentreData;
  /** The drawer the address opens (`?request=`, or `?new=` and `?student=` from A.3), if any. */
  detail: RequestDetail | null;
  /** The address names a request the caller may not see. */
  missing: boolean;
  /** The signed-in staff member's id, whose avatar is lime in Recent access. */
  me: string;
  nowMs: number;
  act?: (input: RequestAction) => Promise<RequestActionResult>;
  save?: (input: { workspaceId: string; settings: WorkspaceSettings }) => Promise<SaveSettingsResult>;
};

const CENTRE = "/privacy-centre" as Route;
export const AUDIT_LOG_HREF = "/privacy-centre/audit-log" as Route;

/** A card of A.5: surface, default border, the card radius, Card/Title and its content. */
function Card({
  title,
  aside,
  action,
  caption,
  className,
  children,
}: {
  title: string;
  /** Next to the title: the Requests count. */
  aside?: ReactNode;
  /** At the end of the head: Recent access's "Open audit log". */
  action?: ReactNode;
  caption?: string;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={`flex w-full flex-col items-start overflow-clip rounded-card border border-line-default bg-surface px-5 text-fg-primary ${className ?? ""}`}
    >
      <div className="flex w-full items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <div className="flex items-center gap-2">
            <h2 id={id} className="type-card-title">
              {title}
            </h2>
            {aside}
          </div>
          {caption === undefined ? null : <p className="opacity-60 type-ui-caption">{caption}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The Data map's rows (107:11102): what Üki keeps, where, how long and who sees it. */
type MapRow = { id: string; icon: IconName; data: string; where: string; kept: string; who: string };

/**
 * A.5 Privacy centre (Figma 107:11102) for the exam office: the on-device banner, the data map, the
 * latest access from the audit log, the retention rule with the next nightly cleanup, and the data
 * requests. A request opens A.5a or A.5b (`?request=`) over the page. The Processing record (A.5c) and
 * the integrity reports' retention are not drawn (docs/decisions.md, 1.12).
 */
export function PrivacyCentreView({
  data,
  detail,
  missing,
  me,
  nowMs,
  act = actOnRequest,
  save = saveWorkspaceSettings,
}: PrivacyCentreViewProps) {
  const t = useTranslations("dashboard.privacy");
  const format = useFormatter();
  const locale = useDashboardLocale();
  const router = useRouter();
  const toast = useToast();
  const audit = useAuditText();
  const [settings, setSettings] = useState(data.settings);
  const saved = useRef(data.settings);
  const [saving, startSaving] = useTransition();
  const requests = requestList(data.requests, nowMs);
  // Each server render brings new objects, so a drawer the address opens again shows again.
  const drawerToken: object | null = detail ?? (missing ? data : null);
  const [closed, setClosed] = useState<object | null>(null);
  const showDrawer = drawerToken !== null && drawerToken !== closed;
  const cleanup = nextCleanup(nowMs, settings.retention_days);

  const changeRetention = (days: number) => {
    const next = applyChange(settings, { key: "retention_days", value: days });
    if (next === null) return;
    setSettings(next);
    startSaving(async () => {
      let result: SaveSettingsResult;
      try {
        result = await save({ workspaceId: data.workspaceId, settings: next });
      } catch {
        result = { ok: false, error: "failed" };
      }
      if (result.ok) {
        saved.current = result.settings;
        toast.show({ id: "privacy-retention", kind: "success", message: t("retention.saved") });
        // The next cleanup's count depends on the rule.
        router.refresh();
      } else {
        setSettings(saved.current);
        toast.show({ id: "privacy-retention", kind: "error", message: t(`retention.error.${result.error}`) });
      }
    });
  };

  const mapRows: MapRow[] = [
    {
      id: "video",
      icon: "camera",
      data: t("map.video.data"),
      where: t("map.video.where"),
      kept: t("map.video.kept"),
      who: t("map.video.who"),
    },
    {
      id: "face",
      icon: "face-scan",
      data: t("map.face.data"),
      where: t("map.face.where"),
      kept: t("map.face.kept"),
      who: t("map.face.who"),
    },
    {
      id: "frames",
      icon: "report",
      data: t("map.frames.data"),
      where: t("map.server"),
      kept: t("map.frames.kept", { days: settings.retention_days }),
      who: t("map.staff"),
    },
    {
      id: "events",
      icon: "list-check",
      data: t("map.events.data"),
      where: t("map.server"),
      kept: t("map.events.kept"),
      who: t("map.staff"),
    },
    {
      id: "audio",
      icon: "mic",
      data: t("map.audio.data"),
      where: t("map.audio.where"),
      kept: t("map.none"),
      who: t("map.none"),
    },
    {
      id: "reports",
      icon: "file-text",
      data: t("map.reports.data"),
      where: t("map.reports.where"),
      kept: t("map.reports.kept"),
      who: t("map.reports.who"),
    },
  ];

  const requestLine = (row: RequestRow): string => {
    const name = row.students.full_name;
    if (row.status === "received") {
      return t("requests.due", { name, date: formatDayMonth(row.due_at, locale) });
    }
    const date = row.done_at === null ? "" : formatDayMonth(row.done_at, locale);
    return row.status === "replied"
      ? t("requests.replied", { name, date })
      : t("requests.done", { name, date });
  };

  return (
    <>
      <PageHeader breadcrumb={t("breadcrumb")} title={t("title")} />
      <main className="flex flex-col gap-5 px-8 pt-7 pb-8" aria-busy={saving || undefined}>
        <section className="flex w-full items-center gap-4.5 overflow-clip rounded-card bg-brand-subtle px-5 py-3.5 text-fg-primary">
          <Image src={laptopShieldArt} alt="" className="size-18 shrink-0 object-contain" />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <h2 className="type-card-title">{t("banner.title")}</h2>
            <p className="opacity-70 type-ui-label">{t("banner.body", { count: data.sessionsThisTerm })}</p>
          </div>
        </section>

        <div className="flex w-full items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <Card title={t("map.title")} caption={t("map.caption")} className="gap-3.5 pt-4.5 pb-5">
              {/* The frame stacks the header and the rows 14 px apart, each row 41 px with its rule. */}
              <table className="-my-3.5 w-full border-separate border-spacing-x-0 border-spacing-y-3.5 text-left">
                <thead>
                  <tr className="opacity-60 type-mono-tag">
                    <th scope="col" className="w-46 rounded-l-sm bg-subtle px-3 py-2.25 font-medium">
                      {t("map.column.data")}
                    </th>
                    <th scope="col" className="w-49 bg-subtle px-3 py-2.25 font-medium">
                      {t("map.column.where")}
                    </th>
                    <th scope="col" className="w-37.5 bg-subtle px-3 py-2.25 font-medium">
                      {t("map.column.kept")}
                    </th>
                    <th scope="col" className="rounded-r-sm bg-subtle px-3 py-2.25 font-medium">
                      {t("map.column.who")}
                    </th>
                  </tr>
                </thead>
                <tbody className="type-ui-label">
                  {mapRows.map((row) => (
                    <tr key={row.id} data-map-row={row.id} className="group">
                      <th
                        scope="row"
                        className="border-line-default border-b px-3 py-2.5 font-medium group-last:border-b-0"
                      >
                        <span className="flex min-h-5 items-center gap-2.5">
                          <Icon name={row.icon} className="size-4 shrink-0" />
                          {row.data}
                        </span>
                      </th>
                      <td className="border-line-default border-b px-3 py-2.5 group-last:border-b-0">
                        {row.where}
                      </td>
                      <td className="border-line-default border-b px-3 py-2.5 opacity-80 group-last:border-b-0">
                        {row.kept}
                      </td>
                      <td className="border-line-default border-b px-3 py-2.5 opacity-80 group-last:border-b-0">
                        {row.who}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card
              title={t("recent.title")}
              className="gap-2.5 py-4.5"
              action={
                <Link
                  href={AUDIT_LOG_HREF}
                  prefetch={false}
                  className="flex shrink-0 items-center gap-1 rounded-sm outline-none type-ui-label focus-visible:shadow-focus"
                >
                  {t("recent.open")}
                  <Icon name="arrow-right" className="size-3.5" />
                </Link>
              }
            >
              {data.recent.length === 0 ? (
                <p className="opacity-60 type-ui-caption">{t("recent.empty")}</p>
              ) : (
                <ul className="flex w-full flex-col gap-2.5">
                  {data.recent.map((entry) => (
                    <li key={entry.id} className="flex w-full items-center gap-3" data-audit-id={entry.id}>
                      <span className="w-27.5 shrink-0 opacity-55 type-ui-mono">{audit.time(entry.at)}</span>
                      <span className="flex w-47.5 shrink-0 items-center gap-2 overflow-clip">
                        <WhoMark entry={entry} me={me} size="xs" />
                        <span className="truncate type-ui-label">{audit.who(entry)}</span>
                      </span>
                      <span className="min-w-0 flex-1 truncate opacity-85 type-ui-label">
                        {audit.action(entry)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="flex w-90 shrink-0 flex-col gap-4">
            <Card title={t("retention.title")} className="gap-3.5 pt-4.5 pb-5">
              <Select
                className="w-full"
                label={t("retention.frames")}
                icon="archive"
                value={String(settings.retention_days)}
                onValueChange={(value) => changeRetention(Number(value))}
              >
                {withCurrent(RETENTION_OPTIONS, settings.retention_days).map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {t("map.frames.kept", { days })}
                  </SelectItem>
                ))}
              </Select>
              <p className="opacity-60 type-ui-caption" data-next-cleanup={cleanup.at.toISOString()}>
                {t("retention.next", {
                  time: timeOf(cleanup.at),
                  count: data.cleanup.frames,
                })}
              </p>
            </Card>

            <Card
              title={t("requests.title")}
              aside={requests.open > 0 ? <Count tone="brand">{format.number(requests.open)}</Count> : null}
              className="gap-3 pt-4.5 pb-5"
            >
              {requests.rows.length === 0 ? (
                <p className="opacity-60 type-ui-caption">{t("requests.empty")}</p>
              ) : (
                <ul className="flex w-full flex-col gap-3.5">
                  {requests.rows.map((row) => (
                    <li key={row.id} className="flex w-full items-center gap-3" data-request-id={row.id}>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-subtle">
                        <Icon name={row.kind === "delete" ? "trash" : "download"} className="size-4" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col items-start gap-px overflow-clip whitespace-nowrap">
                        <p className="type-ui-label">{t(`requests.kind.${row.kind}`)}</p>
                        <p className="max-w-full truncate opacity-55 type-ui-caption">{requestLine(row)}</p>
                      </div>
                      <Link
                        href={drawerHref({ type: "request", requestId: row.id }) as Route}
                        prefetch={false}
                        scroll={false}
                        className="flex shrink-0 items-center gap-1 rounded-sm outline-none type-ui-label focus-visible:shadow-focus"
                      >
                        {t("requests.review")}
                        <Icon name="arrow-right" className="size-3.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </main>

      <RequestDrawer
        key={detail === null ? "none" : `${detail.student.id}:${detail.kind}`}
        detail={showDrawer ? detail : null}
        missing={showDrawer && missing}
        act={act}
        onClose={() => {
          // Closing reads nothing new, so it only changes the address: no second privacy_centre.read.
          setClosed(drawerToken);
          window.history.replaceState(null, "", CENTRE);
        }}
        onChanged={(requestId) => {
          const href = drawerHref({ type: "request", requestId }) as Route;
          if (detail?.request?.id === requestId) router.refresh();
          else router.replace(href, { scroll: false });
        }}
      />
    </>
  );
}
