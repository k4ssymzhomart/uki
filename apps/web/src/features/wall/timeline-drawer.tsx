"use client";

import { type CompactEvent, type Locale, type MessagePreset, Uuid } from "@uki/contracts";
import { createUkiTranslator, formatTime } from "@uki/i18n";
import {
  Avatar,
  Button,
  Chip,
  cn,
  EventRow,
  EvidenceCard,
  IconButton,
  initials,
  Spinner,
  Tab,
  TabGroup,
} from "@uki/ui";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  DRAWER_STATE_CHIP,
  drawerState,
  KIND_CHIP,
  latestFlag,
  mergeTimeline,
  suggestedPreset,
} from "./drawer-model.ts";
import { toSeconds } from "./durations.ts";
import { type MessageTarget, messageRequest, presetsFor } from "./message-target.ts";
import { pronounFromName, shortName } from "./names.ts";
import { type AnyClient, fetchSessionTimeline } from "./queries.ts";
import { presetId } from "./quick-message.tsx";
import { selectTileResult } from "./tiles.ts";
import { useCommand, useFunctionsClient } from "./use-command.ts";
import { useEventCopy } from "./use-event-copy.ts";
import { useStills } from "./use-stills.ts";
import { useWall } from "./wall-store-context.tsx";

const EMPTY: readonly CompactEvent[] = [];

/** Preset text in one language, for "presets in the student's language with Russian and English beneath". */
function presetTranslators() {
  const make = (locale: Locale) => createUkiTranslator(locale, "message.preset");
  return { kk: make("kk"), ru: make("ru"), en: make("en") } as const;
}

/** The session's full timeline: fetched once when the drawer opens, then followed through the store. */
function useTimeline(client: AnyClient, sessionId: string): { events: CompactEvent[]; loading: boolean } {
  const [fetched, setFetched] = useState<{ sessionId: string; events: CompactEvent[] } | null>(null);
  const live = useWall((state) => state.events[sessionId] ?? EMPTY);
  useEffect(() => {
    let cancelled = false;
    void fetchSessionTimeline(client, sessionId).then((events) => {
      if (!cancelled) setFetched({ sessionId, events });
    });
    return () => {
      cancelled = true;
    };
  }, [client, sessionId]);
  const mine = fetched?.sessionId === sessionId ? fetched.events : null;
  const events = useMemo(() => mergeTimeline(mine ?? [], live), [mine, live]);
  return { events, loading: mine === null };
}

function DrawerMessage({
  target,
  locale,
  initial,
  pronoun,
  disabled,
}: {
  target: MessageTarget & { scope: "student" };
  locale: Locale;
  initial: MessagePreset;
  pronoun: ReturnType<typeof pronounFromName>;
  disabled: boolean;
}) {
  const t = useTranslations("dashboard.wall.drawer");
  const { send, pending } = useCommand();
  const translators = useMemo(presetTranslators, []);
  const presets = presetsFor(target);
  const [chosen, setChosen] = useState<MessagePreset>(
    presets.includes(initial) ? initial : (presets[0] ?? initial),
  );
  const beneath = (["ru", "en"] as const).filter((l) => l !== locale);
  const labelId = `drawer-message-${target.sessionId}`;

  return (
    <div className="flex w-full flex-col items-start gap-2.5 overflow-clip rounded-card bg-surface px-4 pt-3.5 pb-4">
      <p id={labelId} className="opacity-60 type-mono-tag">
        {t("messageLabel", { pronoun })}
      </p>
      <TabGroup
        aria-labelledby={labelId}
        value={chosen}
        onValueChange={(next) => {
          const preset = presets.find((p) => p === next);
          if (preset !== undefined) setChosen(preset);
        }}
        className="flex w-full flex-wrap gap-1.5 overflow-visible bg-transparent p-0 inset-ring-0"
      >
        {presets.map((preset) => (
          <Tab key={preset} value={preset} lang={locale}>
            {translators[locale](presetId(preset))}
          </Tab>
        ))}
      </TabGroup>
      <div className="flex w-full flex-wrap gap-1.5">
        {beneath.map((l) => (
          <p key={l} lang={l} className="px-3.5 py-1.75 text-fg-primary/60 type-ui-label">
            {translators[l](presetId(chosen))}
          </p>
        ))}
      </div>
      <div className="flex w-full items-start justify-end gap-2.5">
        <Button
          variant="primary"
          loading={pending}
          disabled={disabled}
          onClick={() => {
            const request = messageRequest(target, { preset: chosen });
            if (request !== null && !pending) void send(request);
          }}
        >
          {t("send")}
        </Button>
      </div>
    </div>
  );
}

function DrawerBody({
  client,
  sessionId,
  onClose,
}: {
  client: AnyClient;
  sessionId: string;
  onClose: () => void;
}) {
  const t = useTranslations("dashboard.wall");
  const { describe, text } = useEventCopy();
  const getClient = useFunctionsClient();
  const session = useWall((state) => state.sessions[sessionId]);
  const student = useWall((state) => (session === undefined ? undefined : state.students[session.studentId]));
  const tileState = useWall((state) => selectTileResult(state, sessionId)?.state);
  const questionTotal = useWall((state) => state.exam.questionCount);
  const confirmed = useWall((state) => {
    const flagged = latestFlag(mergeTimeline([], state.events[sessionId] ?? EMPTY));
    return flagged === undefined ? 0 : (state.frames[flagged.id]?.length ?? 0);
  });
  const { events, loading } = useTimeline(client, sessionId);
  const flag = latestFlag(events);
  const stills = useStills({
    eventId: flag?.id ?? null,
    frameCount: flag?.frame_count ?? 0,
    confirmed,
    getClient,
  });
  const [selected, setSelected] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus moves into the dialog without the keyboard ring a pointer user did not ask for.
    closeRef.current?.focus({ focusVisible: false });
  }, []);

  if (session === undefined || student === undefined) return null;
  const name = student.fullName;
  const pronoun = pronounFromName(name);
  const state = drawerState(session, tileState);
  const question = session.status?.question ?? null;
  const flagCopy = flag === undefined ? undefined : describe(flag);
  const score = flag?.type === "phone.detected" ? flag.data.score : undefined;
  const heldMs = flag?.type === "phone.detected" ? flag.data.held_ms : undefined;
  const still = stills.stills[Math.min(selected, stills.stills.length - 1)];

  return (
    <>
      <div className="flex w-full items-center gap-3">
        <Avatar initials={initials(name)} className="size-11 type-card-title" />
        <div className="flex min-w-0 flex-1 flex-col items-start overflow-clip whitespace-nowrap">
          <h2 id={`drawer-title-${sessionId}`} className="max-w-full truncate type-ui-title">
            {name}
          </h2>
          <p className="opacity-60 type-ui-mono">
            {t("drawer.meta", {
              number: student.number,
              seat: student.seat === null ? "none" : String(student.seat),
              os: session.device.os ?? "other",
            })}
          </p>
        </div>
        <IconButton ref={closeRef} icon="chevron-right" label={t("drawer.close")} onClick={onClose} />
      </div>

      <div className="flex flex-wrap items-start gap-2">
        {flag !== undefined && flagCopy !== undefined ? (
          <Chip status={KIND_CHIP[flagCopy.kind]}>
            {typeof score === "number"
              ? t("drawer.phoneChip", { score })
              : text(flagCopy.feed ?? flagCopy.title)}
          </Chip>
        ) : null}
        <Chip status={DRAWER_STATE_CHIP[state]}>{t("drawer.state", { state })}</Chip>
        {question === null ? null : (
          <Chip status="idle">
            {questionTotal === null
              ? t("drawer.questionNoTotal", { question })
              : t("drawer.question", { question, total: questionTotal })}
          </Chip>
        )}
      </div>

      {flag !== undefined && flagCopy !== undefined ? (
        <>
          <EvidenceCard
            className="w-full shrink-0"
            image={
              still === undefined ? undefined : (
                // biome-ignore lint/performance/noImgElement: signed 5-minute URLs must not pass through the Next.js image cache
                <img
                  src={still.url}
                  alt={t("drawer.still", {
                    index: stills.stills.indexOf(still) + 1,
                    count: stills.stills.length,
                    time: formatTime(still.captured_at, "en", { seconds: true }),
                  })}
                  className="size-full object-cover"
                />
              )
            }
            chipLabel={
              typeof score === "number"
                ? t("drawer.phoneChip", { score })
                : text(flagCopy.feed ?? flagCopy.title)
            }
            chipStatus={KIND_CHIP[flagCopy.kind]}
            time={formatTime(flag.at, "en", { seconds: true })}
            dateTime={flag.at}
            title={text(flagCopy.title)}
            detail={
              typeof heldMs === "number"
                ? t("event.phone_detected.held", { seconds: toSeconds(heldMs) })
                : flagCopy.detail === undefined
                  ? undefined
                  : text(flagCopy.detail)
            }
          />
          {stills.stills.length > 1 ? (
            <ul aria-label={t("drawer.stills")} className="flex w-full shrink-0 gap-2">
              {stills.stills.map((s, index) => (
                <li key={s.frame_id} className="flex min-w-0 flex-1">
                  <button
                    type="button"
                    aria-pressed={s === still}
                    onClick={() => setSelected(index)}
                    className="relative h-16 w-full cursor-pointer overflow-clip rounded-md outline-none focus-visible:shadow-focus"
                  >
                    {/* biome-ignore lint/performance/noImgElement: signed 5-minute URLs must not pass through the Next.js image cache */}
                    <img
                      src={s.url}
                      alt={t("drawer.still", {
                        index: index + 1,
                        count: stills.stills.length,
                        time: formatTime(s.captured_at, "en", { seconds: true }),
                      })}
                      className="absolute inset-0 size-full object-cover"
                    />
                    {s === still ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 rounded-md inset-ring-2 inset-ring-brand"
                      />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      <h3 className="type-card-title">{t("drawer.timeline")}</h3>
      {loading ? (
        <Spinner size="md" label={t("drawer.loading")} />
      ) : (
        <ol className="flex w-full flex-col">
          {events.map((event) => {
            const copy = describe(event);
            return (
              <li key={event.id}>
                <EventRow
                  kind={copy.kind}
                  time={formatTime(event.at, "en", { seconds: true })}
                  dateTime={event.at}
                  title={text(copy.title)}
                  detail={copy.detail === undefined ? undefined : text(copy.detail)}
                />
              </li>
            );
          })}
        </ol>
      )}

      <span aria-hidden="true" className="min-h-5 flex-1" />
      {loading ? null : (
        <DrawerMessage
          target={{ scope: "student", sessionId, name: shortName(name) }}
          locale={session.locale}
          initial={suggestedPreset(flag)}
          pronoun={pronoun}
          disabled={state === "submitted" || state === "time_up" || state === "ended"}
        />
      )}
    </>
  );
}

/** The `?session=<id>` value when it is a session of this wall. */
export function useDrawerSession(): string | null {
  const [sessionId, setSessionId] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const value = new URLSearchParams(window.location.search).get("session");
      setSessionId(value !== null && Uuid.safeParse(value).success ? value : null);
    };
    read();
    window.addEventListener("popstate", read);
    window.addEventListener("uki:drawer", read);
    return () => {
      window.removeEventListener("popstate", read);
      window.removeEventListener("uki:drawer", read);
    };
  }, []);
  return sessionId;
}

/** Opens or closes 2.5 by changing `?session=` without a server round trip. */
export function setDrawerSession(sessionId: string | null): void {
  const url = new URL(window.location.href);
  if (sessionId === null) {
    url.searchParams.delete("session");
    window.history.replaceState(window.history.state, "", url);
  } else {
    url.searchParams.set("session", sessionId);
    window.history.pushState(window.history.state, "", url);
  }
  window.dispatchEvent(new Event("uki:drawer"));
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 2.5 Student timeline (Figma 51:2082): a 520 px drawer over the dimmed wall. Escape, the scrim and
 * the close button close it; focus stays inside while it is open and returns to the tile after.
 */
export function TimelineDrawer({ client, sessionId }: { client: AnyClient; sessionId: string | null }) {
  const known = useWall((state) => (sessionId === null ? false : state.sessions[sessionId] !== undefined));
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const [shown, setShown] = useState(false);
  const open = sessionId !== null && known;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const frame = window.requestAnimationFrame(() => setShown(true));
    return () => {
      window.cancelAnimationFrame(frame);
      setShown(false);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);

  if (!open || sessionId === null) return null;
  const close = () => setDrawerSession(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab" || panel.current === null) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <div aria-hidden="true" onClick={close} className="fixed inset-0 z-40 bg-inverse/40" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`drawer-title-${sessionId}`}
        onKeyDown={onKeyDown}
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-130 max-w-full flex-col items-start gap-3.5 overflow-y-auto border-l border-line-default bg-canvas px-6 pt-5.5 pb-6 text-fg-primary",
          "transition-transform duration-300 ease-in-out motion-reduce:transition-none",
          shown ? "translate-x-0" : "translate-x-full",
        )}
      >
        <DrawerBody key={sessionId} client={client} sessionId={sessionId} onClose={close} />
      </div>
    </>
  );
}
