"use client";

import { Avatar, Banner, Button, Checkbox, cn, Drawer, initials, TextArea, useToast } from "@uki/ui";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { printedVerifyCode } from "../report/report-model.ts";
import { formatDayMonth } from "../students/student-format.ts";
import type { RequestAction, RequestActionResult } from "./privacy-actions.ts";
import type { RequestDetail } from "./privacy-data.ts";
import { type ActionError, deleteCount, deleteItems, firstName } from "./privacy-model.ts";

export type RequestDrawerProps = {
  /** The request (or the new one from A.3) the address names; null when it names nothing visible. */
  detail: RequestDetail | null;
  /** The address names a request, but not one the caller may see: the drawer says so. */
  missing: boolean;
  /** Calls the data-request function; the server action by default, a stub in tests. */
  act: (input: RequestAction) => Promise<RequestActionResult>;
  onClose: () => void;
  /** After an action changed the request: reload the page, opening `requestId`'s drawer. */
  onChanged: (requestId: string) => void;
};

type Line = { id: string; title: string; detail: string; action: string; keep: boolean };

/**
 * One row of the drawer's list (A.5a 165:14035, A.5b 165:16241): the box, title and detail, and what
 * happens to it. The box only shows what the action does: a delete removes every Delete row and keeps
 * every Keep row, and a copy includes all four, so it cannot be changed (docs/decisions.md, 1.12).
 */
function ListRow({ line }: { line: Line }) {
  return (
    <li
      className={cn(
        "flex w-full items-center gap-3 border-line-default border-t px-4 py-3.5 first:border-t-0",
        line.keep && "bg-subtle",
      )}
      data-item={line.id}
    >
      <Checkbox
        checked={!line.keep}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none"
        boxClassName={line.keep ? "opacity-40" : undefined}
      />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <p className="type-ui-label">{line.title}</p>
        <p className="opacity-65 type-card-caption">{line.detail}</p>
      </div>
      <p className={cn("shrink-0 type-ui-mono", line.keep && "opacity-65")}>{line.action}</p>
    </li>
  );
}

/**
 * A.5a Delete request and A.5b Copy request: the 480 px drawer over the privacy centre. It names the
 * student and the dates, lists what Üki keeps about them (counted under the caller's RLS) and acts
 * through the data-request Edge Function: Delete removes the stills, frames, events, identity score and
 * device record and keeps the answers, receipts and reports; Create secure link writes the JSON copy and
 * shows its 7-day link once; Reply with a reason answers a delete request instead. Each action leaves
 * its audit row, which A.6 lists. A done request shows who answered it and when.
 */
export function RequestDrawer({ detail, missing, act, onClose, onChanged }: RequestDrawerProps) {
  const t = useTranslations("dashboard.privacy");
  const format = useFormatter();
  const locale = useDashboardLocale();
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [link, setLink] = useState<{ url: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startAction] = useTransition();

  const open = detail !== null || missing;
  const day = (at: string) => formatDayMonth(at, locale);

  if (detail === null) {
    return (
      <Drawer
        open={open}
        onOpenChange={(next) => (next ? undefined : onClose())}
        title={t("drawer.title.delete")}
        closeLabel={t("drawer.close")}
        className="w-120"
      >
        <Banner kind="error" title={t("drawer.notFound")} />
      </Drawer>
    );
  }

  const { counts, student, request, kind } = detail;
  const status = request?.status ?? "received";
  const name = firstName(student.full_name);
  const doneBy = detail.doneBy ?? t("audit.who.staff");
  const doneAt = request?.done_at ?? null;

  const run = (
    input: RequestAction,
    onDone?: (result: Extract<RequestActionResult, { ok: true }>) => void,
  ) => {
    setError(null);
    startAction(async () => {
      let result: RequestActionResult;
      try {
        result = await act(input);
      } catch {
        result = { ok: false, error: "failed", requestId: null };
      }
      if (!result.ok) {
        setError(result.error);
        // A new request may have been saved before the function refused: show it as it is now.
        if (result.requestId !== null && request === null) onChanged(result.requestId);
        return;
      }
      onDone?.(result);
      onChanged(result.requestId);
    });
  };

  const target = request === null ? { studentId: student.id, kind } : { requestId: request.id };

  const removeData = () =>
    run({ ...target, action: "delete" }, () => {
      toast.show({ id: "privacy", kind: "success", message: t("delete.toast") });
    });
  const makeCopy = () =>
    run({ ...target, action: "copy" }, (result) => {
      setLink(result.link);
      setCopied(false);
    });
  const sendReply = () =>
    run({ ...target, action: "reply", reply: reason.trim() }, () => {
      setReplying(false);
      setReason("");
      toast.show({ id: "privacy", kind: "success", message: t("reply.toast") });
    });
  const copyLink = async () => {
    if (link === null) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  // What the list shows: A.5a's delete and keep rows, or A.5b's four included rows.
  const items = deleteItems(counts);
  const lines: Line[] =
    kind === "delete"
      ? items.map((item) => {
          const keep = item.action === "keep";
          const detailText = (() => {
            switch (item.id) {
              case "frames":
                return t("delete.item.frames.detail", { count: counts.frames, exams: counts.frameExams });
              case "events":
                return t("delete.item.events.detail", { count: counts.events, exams: counts.eventExams });
              case "identity":
                return t("delete.item.identity.detail", {
                  scores: counts.identityScores,
                  devices: counts.devices,
                });
              case "results":
                return t("delete.item.results.detail", { count: counts.exams });
              case "reports":
                return t("delete.item.reports.detail", {
                  codes: counts.reports.map((code) => printedVerifyCode(code)).join(", "),
                });
            }
          })();
          return {
            id: item.id,
            title: t(`delete.item.${item.id}.title`),
            detail: detailText,
            action: t(`delete.action.${item.action}`),
            keep,
          };
        })
      : [
          {
            id: "history",
            title: t("copy.item.history.title"),
            detail: t("copy.item.history.detail", { count: counts.exams }),
            action: t("copy.action.include"),
            keep: false,
          },
          {
            id: "flags",
            title: t("copy.item.flags.title"),
            detail: t("copy.item.flags.detail", { flags: counts.flags, frames: counts.frames }),
            action: t("copy.action.include"),
            keep: false,
          },
          {
            id: "consent",
            title: t("copy.item.consent.title"),
            detail: t("copy.item.consent.detail", { count: counts.consents }),
            action: t("copy.action.include"),
            keep: false,
          },
          {
            id: "devices",
            title: t("copy.item.devices.title"),
            detail:
              counts.laptops === 0 || counts.appVersion === null
                ? t("copy.item.devices.none")
                : t("copy.item.devices.detail", { count: counts.laptops, version: counts.appVersion }),
            action: t("copy.action.include"),
            keep: false,
          },
        ];

  // The state under the list: what the action will do, or what was done.
  let state: ReactNode;
  if (link !== null) {
    state = (
      <div className="flex w-full flex-col gap-3">
        <Banner
          kind="info"
          title={t("copy.ready.title")}
          body={t("copy.ready.body", { name, date: day(link.expires_at) })}
        />
        <div className="flex w-full items-end gap-2.5">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="type-ui-label">{t("copy.link")}</span>
            <input
              readOnly
              value={link.url}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full truncate rounded-md bg-subtle px-3.5 py-2.5 text-fg-primary outline-none type-ui-mono focus-visible:shadow-focus"
            />
          </label>
          <Button variant="secondary" onClick={copyLink}>
            {copied ? t("copy.copied") : t("copy.copyLink")}
          </Button>
        </div>
      </div>
    );
  } else if (status === "replied") {
    state = (
      <Banner
        kind="offline"
        icon="send"
        title={t("reply.done.title")}
        body={t("reply.done.body", {
          name: doneBy,
          date: doneAt === null ? "" : day(doneAt),
          reply: request?.reply ?? "",
        })}
      />
    );
  } else if (status === "done") {
    state =
      kind === "delete" ? (
        <Banner
          kind="offline"
          icon="trash"
          title={t("delete.done.title")}
          body={t("delete.done.body", { name: doneBy, date: doneAt === null ? "" : day(doneAt) })}
        />
      ) : (
        <Banner
          kind="offline"
          icon="download"
          title={t("copy.done.title")}
          body={t("copy.done.body", { name: doneBy, date: doneAt === null ? "" : day(doneAt) })}
        />
      );
  } else {
    state =
      kind === "delete" ? (
        <Banner kind="info" title={t("delete.banner.title")} body={t("delete.banner.body")} />
      ) : (
        <Banner kind="info" title={t("copy.banner.title")} body={t("copy.banner.body", { name })} />
      );
  }

  let footer: ReactNode = null;
  if (replying) {
    footer = (
      <>
        <Button variant="ghost" disabled={pending} onClick={() => setReplying(false)}>
          {t("reply.cancel")}
        </Button>
        <Button variant="primary" loading={pending} disabled={reason.trim() === ""} onClick={sendReply}>
          {t("reply.send")}
        </Button>
      </>
    );
  } else if (status === "received" && kind === "delete") {
    footer = (
      <>
        <Button variant="ghost" disabled={pending} onClick={() => setReplying(true)}>
          {t("delete.reply")}
        </Button>
        <Button variant="danger" loading={pending} onClick={removeData}>
          {t("delete.button", { count: deleteCount(items) })}
        </Button>
      </>
    );
  } else if (status === "received" && kind === "copy") {
    footer = (
      <>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          {t("copy.cancel")}
        </Button>
        <Button variant="primary" loading={pending} onClick={makeCopy}>
          {t("copy.button")}
        </Button>
      </>
    );
  } else if (status === "done" && kind === "copy" && link === null) {
    footer = (
      <Button variant="primary" loading={pending} onClick={makeCopy}>
        {t("copy.again")}
      </Button>
    );
  }

  const pill =
    status === "received"
      ? { text: t("drawer.due", { date: day(detail.dueAt) }), tone: "bg-warn-subtle" }
      : {
          text: t(status === "replied" ? "drawer.status.replied" : "drawer.status.done", {
            date: doneAt === null ? "" : day(doneAt),
          }),
          tone: "bg-subtle",
        };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={t(`drawer.title.${kind}`)}
      closeLabel={t("drawer.close")}
      className="w-120"
      footer={footer}
    >
      <div className="flex w-full items-center gap-3" data-request-status={status}>
        <Avatar tone="paper" initials={initials(student.full_name, locale)} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <p className="max-w-full truncate type-card-title">
            {t("drawer.who", { name: student.full_name, number: student.student_number })}
          </p>
          <p className="opacity-65 type-card-caption">
            {t("drawer.asked", { date: day(detail.receivedAt) })}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-pill px-2.5 py-1.25 type-ui-mono", pill.tone)}>
          {pill.text}
        </span>
      </div>

      <p className="opacity-60 type-mono-tag">
        {kind === "delete" ? t("delete.label", { name }) : t("copy.label")}
      </p>
      <ul className="w-full shrink-0 overflow-clip rounded-md border border-line-default">
        {lines.map((line) => (
          <ListRow key={line.id} line={line} />
        ))}
      </ul>

      {state}

      {replying ? (
        <TextArea
          label={t("reply.label")}
          value={reason}
          maxLength={2000}
          onChange={(event) => setReason(event.target.value)}
          helper={`${format.number(reason.length)}/${format.number(2000)}`}
        />
      ) : null}

      {error === null ? null : (
        <Banner
          kind="error"
          title={error === "in_exam" ? t("error.in_exam", { name }) : t(`error.${error}`)}
        />
      )}
    </Drawer>
  );
}
