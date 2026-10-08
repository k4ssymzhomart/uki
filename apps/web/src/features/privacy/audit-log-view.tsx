"use client";

import {
  Button,
  cn,
  Icon,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  SearchField,
  Tab,
  TabGroup,
  TableHeaderCell,
  useToast,
} from "@uki/ui";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { PageHeader } from "../shell/page-header.tsx";
import { useAuditText, WhoMark } from "./audit-text.tsx";
import { recordAuditExport } from "./privacy-actions.ts";
import {
  AUDIT_LIMIT,
  AUDIT_RANGES,
  AUDIT_TABS,
  type AuditEntry,
  type AuditFilters,
  type AuditRange,
  type AuditTab,
  actionIcon,
  auditCsv,
  auditCsvName,
  auditPage,
  auditSearch,
  matchesQuery,
} from "./privacy-model.ts";

export type AuditLogViewProps = {
  /** The log of the chosen range and tab, newest first, read on the server under RLS. */
  entries: readonly AuditEntry[];
  /** The range and tab hold more than AUDIT_LIMIT rows: only the newest are here. */
  truncated: boolean;
  /** The filters from the address (`?tab=`, `?range=`, `?q=`). */
  filters: AuditFilters;
  /** The signed-in staff member's id, whose avatar is lime. */
  me: string;
  nowMs: number;
  /** Writes the `audit.export` row before the CSV leaves; the server action by default. */
  recordExport?: () => Promise<{ ok: boolean }>;
};

const AUDIT_LOG = "/privacy-centre/audit-log";

/**
 * Column widths of A.6's table (108:11553): time 160 after the card's 20 px inset, who 230, action 400,
 * object the rest. A cell's width includes its padding, so the time cell is 180 wide.
 */
const columns = {
  time: "w-45 pl-5",
  who: "w-57.5",
  action: "w-100",
  object: "pr-5",
} as const;

/** Saves the CSV the browser built as a file. */
function downloadCsv(csv: string, name: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * A.6 Audit log (Figma 108:11296) for the exam office: every recorded action of the workspace, newest
 * first, one row per entry (each share view is its own row; the stills one person opened at once fold
 * into one). The tabs and the range are read on the server; the search runs in the browser on the who,
 * action and object text. Entries cannot be changed here. Export CSV writes an `audit.export` row, then
 * saves the entries shown.
 */
export function AuditLogView({
  entries,
  truncated,
  filters,
  me,
  nowMs,
  recordExport = recordAuditExport,
}: AuditLogViewProps) {
  const t = useTranslations("dashboard.privacy.audit");
  const format = useFormatter();
  const router = useRouter();
  const toast = useToast();
  const text = useAuditText();
  const [query, setQuery] = useState(filters.query);
  const [page, setPage] = useState(0);
  const [loading, startLoading] = useTransition();
  const [exporting, startExport] = useTransition();

  const lines = entries.map((entry) => ({
    entry,
    who: text.who(entry),
    action: text.action(entry),
    object: text.object(entry),
  }));
  const visible = lines.filter((line) => matchesQuery(`${line.who} ${line.action} ${line.object}`, query));
  const shown = auditPage(visible, page);

  // The search is kept in the address, as the tab and range are.
  useEffect(() => {
    const url = `${AUDIT_LOG}${auditSearch({ ...filters, query })}`;
    if (url !== `${window.location.pathname}${window.location.search}`)
      window.history.replaceState(null, "", url);
  }, [filters, query]);

  const choose = (next: Partial<Pick<AuditFilters, "tab" | "range">>) => {
    setPage(0);
    startLoading(() => {
      router.replace(`${AUDIT_LOG}${auditSearch({ ...filters, ...next, query })}` as Route, {
        scroll: false,
      });
    });
  };

  const exportCsv = () =>
    startExport(async () => {
      let recorded = false;
      try {
        recorded = (await recordExport()).ok;
      } catch {
        recorded = false;
      }
      if (!recorded) {
        toast.show({ id: "audit-export", kind: "error", message: t("exportFailed") });
        return;
      }
      downloadCsv(auditCsv(visible), auditCsvName(nowMs));
    });

  return (
    <>
      <PageHeader breadcrumb={t("breadcrumb")} title={t("title")} />
      <main className="flex flex-col gap-5 px-8 pt-7 pb-8">
        <section
          aria-labelledby="audit-title"
          aria-busy={loading || undefined}
          className="overflow-clip rounded-card border border-line-default bg-surface text-fg-primary"
        >
          <h2 id="audit-title" className="sr-only">
            {t("title")}
          </h2>
          <div className="flex flex-wrap items-center gap-3 py-4 pr-4 pl-5">
            <TabGroup
              value={filters.tab}
              onValueChange={(value) => choose({ tab: value as AuditTab })}
              aria-label={t("tabs")}
              variant="plain"
            >
              {AUDIT_TABS.map((tab) => (
                <Tab key={tab} value={tab}>
                  {t(`tab.${tab}`)}
                </Tab>
              ))}
            </TabGroup>
            <div className="min-w-0 flex-1" />
            <SearchField
              className="min-w-40 max-w-75 shrink basis-40 grow-100"
              label={t("search.label")}
              placeholder={t("search.placeholder")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
            <Menu>
              <MenuTrigger
                aria-label={t("range.label")}
                className="flex shrink-0 cursor-pointer items-center gap-2 rounded-pill py-2.5 pr-2.5 pl-3.5 text-fg-primary outline-none inset-ring inset-ring-line-default type-ui-label focus-visible:shadow-focus"
              >
                {t(`range.${filters.range}`)}
                <Icon name="chevron-down" className="size-4 shrink-0" />
              </MenuTrigger>
              <MenuContent align="end">
                {AUDIT_RANGES.map((range: AuditRange) => (
                  <MenuItem key={range} selected={range === filters.range} onSelect={() => choose({ range })}>
                    {t(`range.${range}`)}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </div>

          <table className="w-full border-collapse text-left" aria-labelledby="audit-title">
            <thead>
              <tr className="bg-subtle">
                <TableHeaderCell className={`${columns.time} h-9 py-0`} label={t("column.time")} />
                <TableHeaderCell className={`${columns.who} h-9 py-0 pl-0`} label={t("column.who")} />
                <TableHeaderCell className={`${columns.action} h-9 py-0 pl-0`} label={t("column.action")} />
                <TableHeaderCell className={`${columns.object} h-9 py-0 pl-0`} label={t("column.object")} />
              </tr>
            </thead>
            <tbody>
              {shown.rows.map(({ entry, who, action, object }) => (
                <tr
                  key={entry.id}
                  data-audit-id={entry.id}
                  data-action={entry.action}
                  className="h-13.25 border-line-default border-b"
                >
                  <td className={`${columns.time} align-middle opacity-60 type-ui-mono`}>
                    <time dateTime={entry.at}>{text.time(entry.at)}</time>
                  </td>
                  <td className={`${columns.who} align-middle`}>
                    <span className="flex min-w-0 items-center gap-2 overflow-clip">
                      <WhoMark entry={entry} me={me} size="sm" />
                      <span className="truncate type-ui-label">{who}</span>
                    </span>
                  </td>
                  <td className={`${columns.action} align-middle`}>
                    <span className="flex min-w-0 items-center gap-2.5 overflow-clip">
                      <Icon name={actionIcon(entry.action)} className="size-4 shrink-0" />
                      <span className="truncate type-ui-label">{action}</span>
                    </span>
                  </td>
                  <td
                    className={cn(columns.object, "max-w-0 truncate align-middle opacity-70 type-ui-label")}
                  >
                    {object}
                  </td>
                </tr>
              ))}
              {shown.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center opacity-60 type-ui-caption">
                    {entries.length === 0 ? t("empty") : t("emptyFiltered")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {truncated ? (
            <p className="border-line-default border-b px-5 py-2.5 opacity-60 type-ui-caption">
              {t("truncated", { count: format.number(AUDIT_LIMIT) })}
            </p>
          ) : null}

          <div className="flex items-center gap-2.5 bg-subtle py-3 pr-4 pl-5">
            <Icon name="lock" className="size-4 shrink-0" />
            <p className="min-w-0 flex-1 opacity-70 type-ui-caption">{t("footer.note")}</p>
            <p className="opacity-60 type-ui-caption" aria-live="polite">
              {t("footer.range", {
                from: format.number(shown.from),
                to: format.number(shown.to),
                total: format.number(shown.total),
              })}
            </p>
            <IconButton
              icon="chevron-left"
              label={t("footer.previous")}
              disabled={shown.page === 0}
              onClick={() => setPage(shown.page - 1)}
            />
            <IconButton
              icon="chevron-right"
              label={t("footer.next")}
              disabled={shown.page >= shown.pageCount - 1}
              onClick={() => setPage(shown.page + 1)}
            />
            <Button
              variant="secondary"
              loading={exporting}
              disabled={visible.length === 0}
              onClick={exportCsv}
            >
              {t("footer.export")}
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}
