import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../cn.ts";
import { Button } from "../controls/button.tsx";
import { TextArea } from "../controls/text-area.tsx";
import { icons } from "../icons.ts";

export interface AskProctorReason {
  value: string;
  label: ReactNode;
}

export interface AskProctorPanelProps extends Omit<ComponentProps<"div">, "children" | "title"> {
  /** "Ask your proctor" (lock.ask.title). */
  title: ReactNode;
  /** "Your proctor sees this on the live wall. Your time keeps running." (lock.ask.body). */
  body: ReactNode;
  /** Accessible name of the close icon. */
  closeLabel: string;
  onClose: () => void;
  /** E.5a's four reasons, in its order (lock.ask.reason.*). */
  reasons: readonly AskProctorReason[];
  /** The chosen reason; Send stays off until one is chosen. */
  reason: string | null;
  onReasonChange: (value: string) => void;
  /** "Note (optional)" (lock.ask.note.label). */
  noteLabel: ReactNode;
  note: string;
  onNoteChange: (value: string) => void;
  /** Most characters the note takes (E.5a: 200). */
  noteMax: number;
  /** "Only your proctor sees this · 32/200" (lock.ask.note.helper). */
  noteHelper: ReactNode;
  /** "Cancel" (action.cancel). */
  cancelLabel: ReactNode;
  /** "Send to proctor" (lock.ask.send). */
  sendLabel: ReactNode;
  onSend: () => void;
  /** The request is on its way: Send shows its loading state. */
  sending?: boolean;
  /**
   * After sending: shown in place of the reasons, the note and the actions, for example a Banner with
   * "Help requested at 10:47" and a Got it button. No frame draws this state.
   */
  confirmation?: ReactNode;
}

/**
 * Ask proctor panel (Figma E.5a 152:11750): a reason, an optional note and Send to proctor. The Lock
 * shows it under its bar and the app over the exam on 2.1 to 2.3. 400 px wide, surface, Shadow/Float.
 */
export function AskProctorPanel({
  title,
  body,
  closeLabel,
  onClose,
  reasons,
  reason,
  onReasonChange,
  noteLabel,
  note,
  onNoteChange,
  noteMax,
  noteHelper,
  cancelLabel,
  sendLabel,
  onSend,
  sending = false,
  confirmation,
  className,
  ...props
}: AskProctorPanelProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const Close = icons.close;
  const Check = icons.check;
  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className={cn(
        "flex w-100 max-w-full flex-col items-stretch gap-4 overflow-clip rounded-card bg-surface p-5 text-fg-primary shadow-float inset-ring inset-ring-line-default",
        className,
      )}
      {...props}
    >
      <div className="flex w-full items-center justify-between gap-3">
        <h2 id={titleId} className="type-card-title">
          {title}
        </h2>
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className="-m-1 inline-flex shrink-0 cursor-pointer items-center justify-center rounded-pill p-1 outline-none hover:bg-hover focus-visible:shadow-focus"
        >
          <Close aria-hidden="true" className="size-4.5 text-icon-primary" />
        </button>
      </div>
      <p className="w-full opacity-72 type-card-caption">{body}</p>
      {confirmation ?? (
        <>
          <div role="radiogroup" aria-labelledby={titleId} className="flex w-full flex-wrap gap-2">
            {reasons.map((option) => {
              const selected = option.value === reason;
              return (
                // biome-ignore lint/a11y/useSemanticElements: a pill that reads as one choice of a radio group, as E.5a draws it
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-reason={option.value}
                  onClick={() => onReasonChange(option.value)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 py-2 type-ui-label outline-none focus-visible:shadow-focus",
                    selected
                      ? "bg-brand text-fg-on-brand hover:bg-brand-hover"
                      : "bg-subtle text-fg-primary hover:bg-hover",
                  )}
                >
                  {selected ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : null}
                  {option.label}
                </button>
              );
            })}
          </div>
          <TextArea
            label={noteLabel}
            value={note}
            maxLength={noteMax}
            helper={noteHelper}
            onChange={(event) => onNoteChange(event.target.value)}
          />
          <div className="flex w-full items-start justify-end gap-2.5">
            <Button variant="ghost" onClick={onClose}>
              {cancelLabel}
            </Button>
            <Button loading={sending} disabled={reason === null} onClick={onSend}>
              {sendLabel}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
