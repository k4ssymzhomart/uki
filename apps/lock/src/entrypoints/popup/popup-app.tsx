import { effectiveBrowserRules } from "@uki/contracts";
import { formatTime, type Locale } from "@uki/i18n";
import {
  type LockAllowedSite,
  type LockNotedEvent,
  type LockPopupCheck,
  LockPopupLocked,
  LockPopupPair,
  LockPopupReady,
  LockPopupReleased,
} from "@uki/ui";
import { useTranslations } from "use-intl";
import { groupCode, OS_KEYS } from "../../lib/os-name.ts";
import type { LockView, NotedAttempt } from "../../lib/state.ts";
import { elapsedShare, formatTimeLeft, wholeMinutes } from "../../lib/time-left.ts";
import { useTimeLeft } from "../../lib/time-left-hook.ts";

export interface PopupActions {
  /** Ask the app for a pairing code. */
  pair(): void;
  /** Pair: confirm the code both sides show. */
  confirm(): void;
  /** Lock and start. */
  lock(): void;
  /** Close on E.9. */
  dismiss(): void;
  /** Phase 1, E.8: Ask proctor, which opens E.5a's sheet in the exam tab. */
  ask(): void;
}

export interface PopupAppProps {
  view: LockView;
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

/** E.8 lists this many of the latest noted attempts; NOTED · n counts them all. */
export const NOTED_SHOWN = 3;

const NOTED_TITLES = {
  "tab.blocked": "lock.noted.tab",
  "site.closed": "lock.noted.site",
  "copy.blocked": "lock.noted.copy",
} as const satisfies Record<NotedAttempt["type"], string>;

const COPY_KINDS = {
  copy: "lock.noted.kind.copy",
  cut: "lock.noted.kind.cut",
  paste: "lock.noted.kind.paste",
  print: "lock.noted.kind.print",
} as const;

/** The phase the app reports for the locked exam; the time left stands still while it is paused. */
function lockedPhase(view: LockView) {
  const locked = view.locked;
  const state = view.exam_state;
  return locked && state?.exam?.session_id === locked.exam.session_id ? state.phase : "writing";
}

/** The 360 px toolbar popup: one Ext/Popup state per screen, every string from the catalog. */
export function PopupApp({ view, otherTabs, nowMs, locale, actions }: PopupAppProps) {
  const t = useTranslations();
  const screen = popupScreen(view);
  const left = useTimeLeft(
    { ends_at: view.locked?.exam.ends_at ?? new Date(nowMs).toISOString(), phase: lockedPhase(view) },
    nowMs,
  );
  const frame = { headerTitle: t("lock.name"), framed: false } as const;
  // E.3: "Windows · Aliya S.", or the OS alone before the student joins.
  const device = (app: NonNullable<LockView["app"]>) => {
    const os = t(OS_KEYS[app.os]);
    return app.student_name ? t("lock.pair.device", { os, student: app.student_name }) : os;
  };
  const appCheck = (title: string): LockPopupCheck | undefined =>
    view.app ? { id: "app", status: "pass", title, detail: device(view.app) } : undefined;

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
      const calculator = effectiveBrowserRules(exam.browser_rules).calculator;
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
          note={t(calculator ? "lock.ready.note.full" : "lock.ready.note.portal_only")}
          footer={t("lock.app.connected")}
        />
      );
    }
    case "locked": {
      // E.8 (98:9927): time left, what is open, the attempts the Lock noted, and Ask proctor.
      const locked = view.locked;
      if (!locked) return null;
      const browser = locked.mode === "browser";
      const host = hostOf(locked.exam.lms_url, locked.exam.allowed_hosts[0]);
      const allowed: LockAllowedSite[] = browser
        ? [{ id: "portal", icon: "globe", label: t("lock.tab.portal"), meta: host }]
        : [];
      if (browser && effectiveBrowserRules(locked.exam.browser_rules).calculator)
        allowed.push({
          id: "calculator",
          icon: "app-window",
          label: t("lock.tab.calculator"),
          meta: t("lock.status.built_in"),
        });
      const noted: LockNotedEvent[] = locked.noted.slice(-NOTED_SHOWN).map((attempt) => ({
        id: attempt.id,
        time: formatTime(attempt.at, locale, { seconds: true }),
        dateTime: new Date(attempt.at).toISOString(),
        title: t(NOTED_TITLES[attempt.type]),
        detail:
          attempt.type === "copy.blocked"
            ? attempt.kind
              ? t(COPY_KINDS[attempt.kind])
              : undefined
            : (attempt.host ?? t("lock.noted.outside")),
      }));
      const paired = view.link === "paired";
      return (
        <LockPopupLocked
          {...frame}
          badge={t("lock.badge")}
          time={formatTimeLeft(left)}
          timeMeta={t("lock.status.ends", { time: formatTime(locked.exam.ends_at, locale) })}
          progress={elapsedShare(locked.exam.starts_at, locked.exam.ends_at, nowMs)}
          allowedLabel={t("lock.status.open")}
          allowed={allowed}
          notedLabel={t("lock.status.noted", { count: locked.blocked_count })}
          noted={noted}
          action={browser ? { label: t("action.ask_proctor"), onClick: actions.ask } : undefined}
          footer={paired ? t("lock.app.watching") : t("lock.pair.open_app.title")}
          footerDotTone={paired ? "ok" : "warn"}
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
