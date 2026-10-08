import type { ReactNode } from "react";
import { Button } from "../controls/button.tsx";
import { EventRow, type EventRowKind } from "../data/event-row.tsx";
import { type IconName, icons } from "../icons.ts";
import { toPercent } from "../proctoring/progress.ts";
import { LockPopup, type LockPopupFrameProps } from "./lock-popup.tsx";
import type { LockPopupAction } from "./lock-popup-pair.tsx";

export interface LockAllowedSite {
  id: string;
  /** globe for the exam portal, app-window for the calculator (Figma). */
  icon: IconName;
  /** "Exam portal". */
  label: ReactNode;
  /** "exam.kru.test", "built in". */
  meta?: ReactNode;
}

export interface LockNotedEvent {
  id: string;
  /** "14:09:31", Asia/Almaty. */
  time: ReactNode;
  dateTime?: string;
  /** "New tab blocked". */
  title: ReactNode;
  /** "Ctrl+T pressed". */
  detail?: ReactNode;
  /** warn in Figma. */
  kind?: EventRowKind;
}

export interface LockPopupLockedProps extends LockPopupFrameProps {
  /** Time left as shown, "17:42". */
  time: ReactNode;
  /** "left · ends 14:40". */
  timeMeta?: ReactNode;
  /** Elapsed share of the exam, 0 to 1 (Figma shows 0.55). */
  progress: number;
  /** Accessible name of the bar, for example "Time used". */
  progressLabel?: string;
  /** "OPEN DURING THE EXAM". */
  allowedLabel: ReactNode;
  /** The sites open during the exam; the section is hidden when empty (exams in the app). */
  allowed: readonly LockAllowedSite[];
  /** "NOTED · 3". The list is hidden when empty. */
  notedLabel?: ReactNode;
  noted?: readonly LockNotedEvent[];
  /** "Ask proctor": opens E.5a's sheet in the bar (browser exams); hidden without it. */
  action?: LockPopupAction;
  className?: string;
}

/**
 * During the exam: time left, what is open, what was blocked, a way to reach the proctor
 * (Figma Ext/Popup · Locked 93:2626, E.8). Phase 0 switched the popup off while locked; Phase 1 shows it.
 */
export function LockPopupLocked({
  time,
  timeMeta,
  progress,
  progressLabel,
  allowedLabel,
  allowed,
  notedLabel,
  noted = [],
  action,
  badgeTone = "ink",
  ...frame
}: LockPopupLockedProps) {
  const value = toPercent(progress);
  return (
    <LockPopup badgeTone={badgeTone} {...frame}>
      <div className="flex items-baseline gap-2.5 whitespace-nowrap">
        <p className="type-mono-display-m">{time}</p>
        {timeMeta ? <p className="type-ui-caption opacity-60">{timeMeta}</p> : null}
      </div>
      <div
        role="progressbar"
        aria-label={progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-1 w-full overflow-hidden rounded-pill bg-subtle"
      >
        <div className="h-full rounded-pill bg-brand" style={{ width: `${value}%` }} />
      </div>
      {allowed.length > 0 ? (
        <section className="flex flex-col items-stretch gap-0.5">
          <h2 className="type-mono-tag opacity-50">{allowedLabel}</h2>
          <ul className="flex flex-col">
            {allowed.map((site) => {
              const Icon = icons[site.icon];
              return (
                <li key={site.id} className="flex items-center gap-2.5 py-1.75">
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-icon-primary" />
                  <span className="type-ui-label min-w-0 flex-1">{site.label}</span>
                  {site.meta ? (
                    <span className="type-ui-mono whitespace-nowrap opacity-50">{site.meta}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {noted.length > 0 ? (
        <section className="flex flex-col items-stretch">
          {notedLabel ? <h2 className="type-mono-tag opacity-50">{notedLabel}</h2> : null}
          {noted.map((event) => (
            <EventRow
              key={event.id}
              kind={event.kind ?? "warn"}
              time={event.time}
              dateTime={event.dateTime}
              title={event.title}
              detail={event.detail}
            />
          ))}
        </section>
      ) : null}
      {action ? (
        <Button
          variant="secondary"
          className="w-full"
          onClick={action.onClick}
          disabled={action.disabled}
          loading={action.loading}
        >
          {action.label}
        </Button>
      ) : null}
    </LockPopup>
  );
}
