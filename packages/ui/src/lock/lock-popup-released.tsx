import type { ReactNode } from "react";
import { Face } from "../art/face.tsx";
import { Button } from "../controls/button.tsx";
import { type Fact, FactList } from "../proctoring/fact-list.tsx";
import { LockPopup, type LockPopupFrameProps } from "./lock-popup.tsx";
import type { LockPopupAction } from "./lock-popup-pair.tsx";

export interface LockPopupReleasedProps extends LockPopupFrameProps {
  /** "Lock released" (lock.done.title). */
  title: ReactNode;
  /** "Submitted at 14:38. Your 3 tabs are back." (lock.done.body). */
  body?: ReactNode;
  /** Locked for, Blocked attempts, Sent to the proctor (lock.done.*). */
  facts: readonly Fact[];
  /** "Close" (lock.done.close). */
  action?: LockPopupAction;
  className?: string;
}

/** After submit: the lock is off, tabs restored, and what was sent (Figma Ext/Popup · Released 93:2688, E.9). */
export function LockPopupReleased({
  title,
  body,
  facts,
  action,
  badgeTone = "ok",
  ...frame
}: LockPopupReleasedProps) {
  return (
    <LockPopup badgeTone={badgeTone} {...frame}>
      <div className="flex items-center gap-3">
        <Face state="happy" className="size-10" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <h2 className="type-card-title">{title}</h2>
          {body ? <p className="type-ui-caption opacity-62">{body}</p> : null}
        </div>
      </div>
      <FactList facts={facts} />
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
