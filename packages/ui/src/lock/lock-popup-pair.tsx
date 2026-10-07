import type { ReactNode } from "react";
import { Button } from "../controls/button.tsx";
import { LockCheck, type LockCheckStatus } from "./lock-check.tsx";
import { LockPopup, type LockPopupFrameProps } from "./lock-popup.tsx";

export interface LockPopupCheck {
  id: string;
  status: LockCheckStatus;
  title: ReactNode;
  detail?: ReactNode;
  statusLabel?: ReactNode;
}

export interface LockPopupAction {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export interface LockPopupPairProps extends LockPopupFrameProps {
  /** "Pair with the Üki app" (lock.pair.title), or "Open the Üki app" while no app answers. */
  title: ReactNode;
  /** "Both should show the same code." (lock.pair.body). */
  body?: ReactNode;
  /** The 6-digit code as shown, "482 913". Hidden until the app sends pair.code. */
  code?: ReactNode;
  /** Accessible name of the code, for example "Pairing code". */
  codeLabel?: string;
  /** The app check, for example pass · "Üki app found" · "Windows 11 · Aliya S.". */
  check?: LockPopupCheck;
  /** "Pair" (lock.pair.action). */
  action?: LockPopupAction;
  /** "Different code? Close this and restart the Üki app." (lock.pair.mismatch). */
  hint?: ReactNode;
  className?: string;
}

/** First run: pair the extension with the desktop app on the same laptop (Figma Ext/Popup · Pair 92:2552, E.3). */
export function LockPopupPair({
  title,
  body,
  code,
  codeLabel,
  check,
  action,
  hint,
  badgeTone = "neutral",
  ...frame
}: LockPopupPairProps) {
  return (
    <LockPopup badgeTone={badgeTone} {...frame}>
      <h2 className="type-card-title">{title}</h2>
      {body ? <p className="type-card-caption opacity-62">{body}</p> : null}
      {code ? (
        <output
          aria-label={codeLabel}
          className="type-mono-code flex justify-center whitespace-nowrap rounded-md bg-subtle py-4"
        >
          {code}
        </output>
      ) : null}
      {check ? (
        <LockCheck
          status={check.status}
          title={check.title}
          detail={check.detail}
          statusLabel={check.statusLabel}
        />
      ) : null}
      {action ? (
        <Button
          variant="primary"
          className="w-full"
          onClick={action.onClick}
          disabled={action.disabled}
          loading={action.loading}
        >
          {action.label}
        </Button>
      ) : null}
      {hint ? <p className="type-ui-caption opacity-58">{hint}</p> : null}
    </LockPopup>
  );
}
