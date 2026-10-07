import { formatTime, type Locale } from "@uki/i18n";
import {
  type LockPopupCheck,
  LockPopupLocked,
  LockPopupPair,
  LockPopupReady,
  LockPopupReleased,
} from "@uki/ui";
import { useTranslations } from "use-intl";
import { deviceLine, groupCode } from "../../lib/os-name.ts";
import type { LockView } from "../../lib/state.ts";
import { elapsedShare, formatTimeLeft, timeLeftMs, wholeMinutes } from "../../lib/time-left.ts";

export interface PopupActions {
  /** Ask the app for a pairing code. */
  pair(): void;
  /** Pair: confirm the code both sides show. */
  confirm(): void;
  /** Lock and start. */
  lock(): void;
  /** Close on E.9. */
  dismiss(): void;
}

export interface PopupAppProps {
  view: LockView;
  /** The product name in the header, from the manifest ("Üki Lock"). */
  productName: string;
  /** Tabs that close at the start, for E.4. */
  otherTabs: number;
  nowMs: number;
  locale: Locale;
  actions: PopupActions;
}

export type PopupScreen = "open_app" | "pair" | "ready" | "paired" | "locked" | "released";

/** Which popup state a view shows (E.3, E.4, locked, E.9). */
export function popupScreen(view: LockView): PopupScreen {
  if (view.locked) return "locked";
  if (view.released) return "released";
  if (view.link === "absent") return "open_app";
  if (view.link === "connected") return "pair";
  const exam = view.exam_state?.exam;
  const phase = view.exam_state?.phase;
  if (exam?.mode === "browser" && phase !== undefined && phase !== "idle" && phase !== "done") return "ready";
  return "paired";
}

function hostOf(url: string | null, fallback: string | undefined): string {
  if (url) {
    try {
      return new URL(url).host;
    } catch {
      // fall through
    }
  }
  return fallback ?? "";
}

/** The 360 px toolbar popup: one Ext/Popup state per screen, every string from the catalog. */
export function PopupApp({ view, productName, otherTabs, nowMs, locale, actions }: PopupAppProps) {
  const t = useTranslations();
  const screen = popupScreen(view);
  const frame = { headerTitle: productName, framed: false } as const;
  const appCheck = (title: string): LockPopupCheck | undefined =>
    view.app
      ? { id: "app", status: "pass", title, detail: deviceLine(view.app.os, view.app.student_name) }
      : undefined;

  switch (screen) {
    case "open_app":
      return (
        <LockPopupPair
          {...frame}
          badge={t("lock.pair.badge")}
          title={t("lock.pair.open_app.title")}
          footer={t("lock.pair.open_app.body")}
          footerDotTone="warn"
        />
      );
    case "pair":
      return (
        <LockPopupPair
          {...frame}
          badge={t("lock.pair.badge")}
          title={t("lock.pair.title")}
          body={t("lock.pair.body")}
          code={view.pair ? groupCode(view.pair.code) : undefined}
          codeLabel={t("lock.pair.title")}
          check={appCheck(t("lock.pair.found"))}
          action={{
            label: t("lock.pair.action"),
            onClick: view.pair ? actions.confirm : actions.pair,
            loading: view.pair === null && view.pair_error === null,
          }}
          hint={t("lock.pair.mismatch")}
          footer={t("lock.app.found")}
        />
      );
    case "paired":
      return (
        <LockPopupPair
          {...frame}
          badge={t("lock.ready.badge")}
          badgeTone="brand"
          title={t("lock.pair.found")}
          check={appCheck(t("lock.ready.app.title"))}
          footer={view.exam_state?.exam ? t("lock.app.connected") : t("lock.app.idle")}
        />
      );
    case "ready": {
      const state = view.exam_state;
      const exam = state?.exam;
      if (!state || !exam) return null;
      const canLock = state.phase === "ready" || state.phase === "writing";
      return (
        <LockPopupReady
          {...frame}
          badge={t("lock.ready.badge")}
          overline={t("lock.ready.next")}
          exam={exam.title}
          examMeta={t("lock.ready.when", {
            time: formatTime(exam.starts_at, locale),
            minutes: wholeMinutes(Date.parse(exam.starts_at), Date.parse(exam.ends_at)),
            host: hostOf(exam.lms_url, exam.allowed_hosts[0]),
          })}
          checks={[
            { id: "app", status: "pass", title: t("lock.ready.app.title"), detail: t("lock.ready.app.ok") },
            {
              id: "tabs",
              status: "wait",
              title: t("lock.ready.tabs.title"),
              detail: t("lock.ready.tabs.body", { count: otherTabs }),
            },
            {
              id: "screen",
              status: "pass",
              title: t("check.screen.title"),
              detail: t("lock.ready.screen.off"),
            },
          ]}
          action={{ label: t("lock.ready.start"), onClick: actions.lock, disabled: !canLock }}
          note={t("lock.ready.note.portal_only")}
          footer={t("lock.app.connected")}
        />
      );
    }
    case "locked": {
      const locked = view.locked;
      if (!locked) return null;
      const host = hostOf(locked.exam.lms_url, locked.exam.allowed_hosts[0]);
      return (
        <LockPopupLocked
          {...frame}
          badge={t("lock.badge")}
          time={formatTimeLeft(timeLeftMs(locked.exam.ends_at, nowMs))}
          timeMeta={t("exam.timer.left")}
          progress={elapsedShare(locked.exam.starts_at, locked.exam.ends_at, nowMs)}
          allowedLabel={null}
          allowed={
            locked.mode === "browser"
              ? [{ id: "portal", icon: "globe", label: t("lock.tab.portal"), meta: host }]
              : []
          }
          footer={t("lock.app.connected")}
          footerDotTone={view.link === "paired" ? "ok" : "warn"}
        />
      );
    }
    case "released": {
      const released = view.released;
      if (!released) return null;
      return (
        <LockPopupReleased
          {...frame}
          badge={t("lock.done.badge")}
          title={t("lock.done.title")}
          body={t("lock.done.body", {
            time: formatTime(released.released_at, locale),
            count: released.tabs_restored,
          })}
          facts={[
            {
              id: "locked_for",
              label: t("lock.done.locked_for.title"),
              value: t("lock.done.locked_for.value", {
                minutes: wholeMinutes(released.started_at, released.released_at),
              }),
            },
            {
              id: "blocked",
              label: t("lock.done.blocked.title"),
              value: t("lock.done.blocked.value", { count: released.blocked_count }),
            },
            { id: "sent", label: t("lock.done.sent.title"), value: t("lock.done.sent.value") },
          ]}
          action={{ label: t("lock.done.close"), onClick: actions.dismiss }}
          footer={t("lock.app.idle")}
        />
      );
    }
  }
}
