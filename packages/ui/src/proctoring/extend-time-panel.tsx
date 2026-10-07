import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../cn.ts";
import { Button } from "../controls/button.tsx";
import { icons } from "../icons.ts";
import { SegmentChoice, type SegmentOption } from "./segment-choice.tsx";

export interface ExtendTimePanelProps extends Omit<ComponentProps<"div">, "children" | "title"> {
  /** "Extend time". */
  title: ReactNode;
  /** Overline of the audience choice, "WHO". The choice is hidden without options. */
  audienceLabel?: ReactNode;
  /** For example Everyone · 125 and one student's name. */
  audienceOptions?: readonly SegmentOption[];
  audience?: string;
  onAudienceChange?: (value: string) => void;
  /** Overline of the minutes choice, "ADD". */
  minutesLabel: ReactNode;
  /** "+5 min", "+10 min", "+15 min"; values are the minutes as strings. */
  minuteOptions: readonly SegmentOption[];
  minutes: string;
  onMinutesChange: (value: string) => void;
  /** The new end before sending, for example "Ends at 11:40 instead of 11:30. Students see the new time at once." */
  note?: ReactNode;
  /** "Add 10 minutes". */
  submitLabel: ReactNode;
  onSubmit: () => void;
  submitting?: boolean;
  submitDisabled?: boolean;
}

/** Proctor adds time for the group or one student (Figma Popover/Extend time 83:2462, frame 2.4c). */
export function ExtendTimePanel({
  title,
  audienceLabel,
  audienceOptions,
  audience,
  onAudienceChange,
  minutesLabel,
  minuteOptions,
  minutes,
  onMinutesChange,
  note,
  submitLabel,
  onSubmit,
  submitting = false,
  submitDisabled = false,
  className,
  ...props
}: ExtendTimePanelProps) {
  const id = useId();
  const TimerIcon = icons.timer;
  const showAudience = audienceOptions !== undefined && audienceOptions.length > 0;
  return (
    <div
      className={cn(
        "flex w-80 flex-col items-stretch gap-3.5 rounded-md border border-line-default bg-surface p-4 text-fg-primary shadow-float",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2.5">
        <TimerIcon aria-hidden="true" className="size-5 shrink-0 text-icon-primary" />
        <h2 className="type-card-title">{title}</h2>
      </div>
      {showAudience ? (
        <SegmentChoice
          labelId={`${id}-who`}
          label={audienceLabel}
          options={audienceOptions}
          value={audience ?? audienceOptions[0]?.value ?? ""}
          onValueChange={(value) => onAudienceChange?.(value)}
        />
      ) : null}
      <SegmentChoice
        labelId={`${id}-add`}
        label={minutesLabel}
        options={minuteOptions}
        value={minutes}
        onValueChange={onMinutesChange}
      />
      {note ? <p className="type-card-caption opacity-62">{note}</p> : null}
      <Button
        variant="primary"
        className="w-full"
        loading={submitting}
        disabled={submitDisabled}
        onClick={onSubmit}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
