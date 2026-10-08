"use client";

import { THRESHOLDS } from "@uki/contracts";
import { Banner, Button, CameraTile, Chip, cn, EventRow, Spinner, StatTile } from "@uki/ui";
import { Icon } from "@uki/ui/icon";
import { StatusDot } from "@uki/ui/proctoring/status-dot";
import { useTranslations } from "next-intl";
import type { ReactNode, Ref } from "react";
import {
  DEMO_CHECKS,
  EVENT_KEYS,
  eventKind,
  FRAME_SOURCE_NAMES,
  facesTone,
  formatElapsed,
  isActive,
  lookOf,
  lookTone,
  ruleTimers,
  type TryEvent,
  type TryProblem,
  type TryState,
} from "./try-model.ts";

export interface TryViewProps {
  state: TryState;
  onStart(): void;
  onStop(): void;
  onResume(): void;
  /** The preview <video>; the container sets its srcObject to the camera stream. */
  videoRef?: Ref<HTMLVideoElement>;
}

/** A card of the demo: white surface, hairline, title and an optional caption. */
function Card({
  title,
  caption,
  children,
  className,
}: {
  title: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-card border border-line-default bg-surface p-6 text-fg-primary",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="type-ui-title">{title}</h2>
        {caption ? <p className="opacity-58 type-ui-caption">{caption}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Label and value rows of the overlay and the timers. */
function Rows({ rows }: { rows: ReadonlyArray<readonly [string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="opacity-58 type-ui-caption">{label}</dt>
          <dd className="text-right type-ui-mono">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProblemBanner({ problem, onRetry }: { problem: TryProblem; onRetry(): void }) {
  const t = useTranslations("dashboard.try");
  return (
    <Banner
      kind="error"
      icon={problem === "denied" || problem === "missing" || problem === "busy" ? "camera" : "alert"}
      title={t(`error.${problem}.title`)}
      body={t(`error.${problem}.body`)}
      action={
        problem === "unsupported" ? null : (
          <Button variant="secondary" onClick={onRetry}>
            {t("retry")}
          </Button>
        )
      }
    />
  );
}

function EventLine({ item }: { item: TryEvent }) {
  const t = useTranslations("dashboard.try");
  const key = EVENT_KEYS[item.type];
  const { event } = item;
  const titleArgs = {
    seconds: event.type === "face.missing" ? DEMO_CHECKS.face_missing_s : DEMO_CHECKS.gaze_s,
  };
  let detail: string | null = null;
  switch (event.type) {
    case "gaze.off_screen":
      detail = t("event.gaze_off_screen.detail", {
        direction: t(`look.${event.data.direction}`),
        duration: event.data.duration_ms / 1000,
      });
      break;
    case "gaze.down":
    case "face.missing":
      detail = t("event.duration", { duration: event.data.duration_ms / 1000 });
      break;
    case "phone.detected":
      detail = t("event.phone_detected.detail", { score: event.data.score });
      break;
    case "face.second":
      detail = t("event.face_second.detail", {
        faces: event.data.faces,
        duration: event.data.duration_ms / 1000,
      });
      break;
    case "session.resumed":
      detail = t("event.session_resumed.detail", { duration: event.data.paused_ms / 1000 });
      break;
    default:
      detail = null;
  }
  const parts = [item.type, detail, item.stills > 0 ? t("events.stills", { count: item.stills }) : null];
  const review = item.review === "flag" ? t("events.flag") : item.review === "log" ? t("events.log") : null;
  return (
    <li>
      <EventRow
        kind={eventKind(item.type)}
        time={formatElapsed(item.elapsedMs)}
        title={t(`event.${key}.title`, titleArgs)}
        detail={parts.filter((part) => part !== null).join(" · ")}
        {...(review ? { kindLabel: review } : {})}
      />
    </li>
  );
}

/**
 * The /try demo (no Figma frame; built from the kit: Camera tile 15:1373, Stat tile 40:2061, Event row
 * 46:2165, Banner 145:2770, Chip 8:26). The camera and its numbers on top, the rule events and the
 * developer overlay below. Every number comes from the detection worker; nothing is sent anywhere.
 */
export function TryView({ state, onStart, onStop, onResume, videoRef }: TryViewProps) {
  const t = useTranslations("dashboard.try");
  const { status, debug, rules } = state;
  const active = isActive(status);
  const faces = debug?.faces ?? 0;
  const look = lookOf(debug);
  const timers = ruleTimers(rules);
  const none = t("overlay.none");
  const number = (value: number | null | undefined, render: (value: number) => string): string =>
    value === null || value === undefined ? none : render(value);

  const overlayRows = [
    [t("overlay.elapsed"), state.elapsedMs === null ? none : formatElapsed(state.elapsedMs)],
    [t("overlay.fps"), number(debug?.fps, (fps) => t("overlay.fpsValue", { fps }))],
    [t("overlay.faceMs"), number(debug?.faceMs, (ms) => t("overlay.msValue", { ms }))],
    [t("overlay.phoneMs"), number(debug?.phoneMs, (ms) => t("overlay.msValue", { ms }))],
    [t("overlay.phoneRate"), number(debug?.phoneChecksPerS, (rate) => t("overlay.rateValue", { rate }))],
    [
      t("overlay.delegate"),
      debug?.delegate
        ? t("overlay.delegateValue", { face: debug.delegate.face, phone: debug.delegate.phone ?? none })
        : none,
    ],
    [
      t("overlay.input"),
      debug?.input ? t("overlay.inputValue", { width: debug.input.width, height: debug.input.height }) : none,
    ],
    [t("overlay.source"), state.source ? FRAME_SOURCE_NAMES[state.source] : none],
    [t("overlay.yaw"), number(debug?.head?.yawDeg, (deg) => t("overlay.degValue", { deg }))],
    [t("overlay.pitch"), number(debug?.head?.pitchDeg, (deg) => t("overlay.degValue", { deg }))],
    [t("overlay.lookLeft"), number(debug?.look?.left, (score) => t("overlay.scoreValue", { score }))],
    [t("overlay.lookRight"), number(debug?.look?.right, (score) => t("overlay.scoreValue", { score }))],
    [t("overlay.lookDown"), number(debug?.look?.down, (score) => t("overlay.scoreValue", { score }))],
    [
      t("overlay.fallback"),
      debug ? (debug.degraded ? t("overlay.fallbackOn") : t("overlay.fallbackOff")) : none,
    ],
  ] as const;

  const timerRows = [
    [t("timers.look"), t("timers.seconds", timers.look)],
    [t("timers.noFace"), t("timers.seconds", timers.noFace)],
    [t("timers.twoFaces"), t("timers.seconds", timers.twoFaces)],
    [t("timers.phoneHits"), t("timers.hits", timers.phone)],
  ] as const;

  const statusLine =
    status.kind === "camera" || status.kind === "models" ? (
      <span className="flex items-center gap-2" data-testid="try-status" data-status={status.kind}>
        <Spinner size="md" />
        <span className="type-label-m">{t(`status.${status.kind}`)}</span>
      </span>
    ) : status.kind === "running" ? (
      <span className="flex items-center gap-2" data-testid="try-status" data-status="running">
        <StatusDot tone="ok" className="size-2" />
        <span className="type-label-m">{t("status.running")}</span>
      </span>
    ) : (
      <span data-testid="try-status" data-status={status.kind} />
    );

  return (
    <div className="mx-auto flex w-full max-w-300 flex-col gap-6 px-6 py-10 lg:px-16 lg:py-14 xl:px-0">
      <Banner kind="info" icon="info" title={t("band.notice")} />
      {status.kind === "failed" ? <ProblemBanner problem={status.problem} onRetry={onStart} /> : null}

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className="flex flex-col gap-4 lg:col-span-7">
          <CameraTile
            className="aspect-4/3 h-auto w-full"
            liveLabel={t("camera.live")}
            showFaceFrame={false}
            {...(state.stream
              ? { facesLabel: t("camera.faces", { count: faces }), facesTone: facesTone(faces) }
              : {})}
          >
            {state.stream ? (
              <video
                ref={videoRef}
                aria-label={t("camera.label")}
                autoPlay
                muted
                playsInline
                className="-scale-x-100"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                <Icon name="camera" className="size-8 text-brand" />
                <p className="type-card-title">{t("start.title")}</p>
                <p className="max-w-90 opacity-72 type-body-s">{t("start.body")}</p>
              </div>
            )}
          </CameraTile>
          {state.stream && (state.away || state.phone) ? (
            <div className="flex flex-wrap gap-2" aria-live="polite">
              {state.away ? <Chip status="warn">{t("cue.away")}</Chip> : null}
              {state.phone ? <Chip status="flag">{t("cue.phone")}</Chip> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-4">
            {statusLine}
            {active ? (
              <Button variant="secondary" onClick={onStop}>
                {t("stop")}
              </Button>
            ) : (
              <Button
                variant="brand"
                onClick={onStart}
                disabled={status.kind === "failed" && status.problem === "unsupported"}
              >
                {t("start.button")}
              </Button>
            )}
          </div>
          {rules?.paused ? (
            <Banner
              kind="warn"
              icon="pause"
              title={t("paused.title")}
              body={t("paused.body")}
              action={
                <Button variant="primary" disabled={!rules.canResume} onClick={onResume}>
                  {t("paused.resume")}
                </Button>
              }
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-5">
          <h2 className="sr-only">{t("panel.title")}</h2>
          <StatTile
            data-testid="try-faces"
            label={t("panel.faces")}
            value={debug ? String(faces) : none}
            caption={t("panel.facesCaption", {
              second: THRESHOLDS.face.secondFaceMs / 1000,
              seconds: DEMO_CHECKS.face_missing_s,
            })}
          />
          <StatTile
            data-testid="try-look"
            label={t("panel.look")}
            value={
              debug ? (
                <span className="flex items-center gap-3">
                  <StatusDot tone={lookTone(look)} className="size-3" />
                  {t(`look.${look}`)}
                </span>
              ) : (
                none
              )
            }
            caption={t("panel.lookCaption", { seconds: DEMO_CHECKS.gaze_s })}
          />
          <StatTile
            data-testid="try-phone"
            label={t("panel.phone")}
            value={number(debug?.phoneScore, (score) => t("overlay.scoreValue", { score }))}
            caption={t("panel.phoneCaption", { threshold: DEMO_CHECKS.phone_score })}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <Card title={t("events.title")} caption={t("events.caption")} className="lg:col-span-7">
          {state.events.length === 0 ? (
            <p className="opacity-72 type-body-s">{t("events.empty")}</p>
          ) : (
            <ol data-testid="try-events" className="flex flex-col divide-y divide-line-default">
              {state.events.map((item) => (
                <EventLine key={item.id} item={item} />
              ))}
            </ol>
          )}
        </Card>
        <div className="flex flex-col gap-6 lg:col-span-5">
          <Card title={t("timers.title")}>
            <div data-testid="try-timers">
              <Rows rows={timerRows} />
            </div>
          </Card>
          <Card title={t("overlay.title")} caption={t("overlay.caption")}>
            <div data-testid="try-overlay">
              <Rows rows={overlayRows} />
            </div>
          </Card>
          <section className="flex gap-3.5 rounded-card bg-brand-subtle p-6 text-fg-primary">
            <Icon name="shield" className="size-5 shrink-0" />
            <div className="flex flex-col gap-1">
              <h2 className="type-card-title">{t("privacy.title")}</h2>
              <p className="opacity-72 type-body-s">{t("privacy.body")}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
