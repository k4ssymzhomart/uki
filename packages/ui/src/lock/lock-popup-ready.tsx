import type { ReactNode } from "react";
import { Button } from "../controls/button.tsx";
import { LockCheck } from "./lock-check.tsx";
import { LockPopup, type LockPopupFrameProps } from "./lock-popup.tsx";
import type { LockPopupAction, LockPopupCheck } from "./lock-popup-pair.tsx";

export interface LockPopupReadyProps extends LockPopupFrameProps {
  /** "NEXT EXAM" (lock.ready.next). */
  overline: ReactNode;
  /** "Physics 1 · Quiz 3". */
  exam: ReactNode;
  /** "Starts 14:00 · 40 min · exam.kru.test" (lock.ready.when). */
  examMeta?: ReactNode;
  /** Üki app, Other tabs, ... Phase 0 hides the Other extensions row. */
  checks: readonly LockPopupCheck[];
  /** "Lock and start" (lock.ready.start). */
  action: LockPopupAction;
  /** "Only the exam portal and the calculator stay open." (lock.ready.note.*). */
  note?: ReactNode;
  className?: string;
}

/** Before the exam: what will close, what stays, one button to lock (Figma Ext/Popup · Ready 92:2592, E.4). */
export function LockPopupReady({
  overline,
  exam,
  examMeta,
  checks,
  action,
  note,
  badgeTone = "brand",
  ...frame
}: LockPopupReadyProps) {
  return (
    <LockPopup badgeTone={badgeTone} {...frame}>
      <div className="flex flex-col items-start gap-1">
        <p className="type-mono-tag opacity-50">{overline}</p>
        <h2 className="type-card-title">{exam}</h2>
        {examMeta ? <p className="type-ui-caption opacity-62">{examMeta}</p> : null}
      </div>
      <div className="flex flex-col items-stretch gap-1">
        {checks.map((check) => (
          <LockCheck
            key={check.id}
            status={check.status}
            title={check.title}
            detail={check.detail}
            statusLabel={check.statusLabel}
          />
        ))}
      </div>
      <Button
        variant="primary"
        className="w-full"
        onClick={action.onClick}
        disabled={action.disabled}
        loading={action.loading}
      >
        {action.label}
      </Button>
      {note ? <p className="type-ui-caption opacity-58">{note}</p> : null}
    </LockPopup>
  );
}
