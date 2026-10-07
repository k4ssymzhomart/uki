import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

export type EventRowKind = "info" | "ok" | "warn" | "flag";

const dot = cva("size-2.5 rounded-pill", {
  variants: {
    kind: {
      info: "bg-fg-primary/28",
      ok: "bg-ok",
      warn: "bg-warn",
      flag: "bg-flag",
    },
  },
});

export type EventRowProps = Omit<ComponentProps<"div">, "children" | "title"> & {
  kind?: EventRowKind;
  /** Clock time as shown, in Asia/Almaty: "10:47:10". */
  time: ReactNode;
  /** Machine-readable instant for the time element, ISO 8601. */
  dateTime?: string;
  /** What happened: "Phone in frame". */
  title: ReactNode;
  /** One detail: "Confidence 0.94 · held 6 s". */
  detail?: ReactNode;
  /** Accessible name of the coloured dot, for example "Flag"; without it the dot is decorative. */
  kindLabel?: string;
};

/** One line of a session timeline: time, coloured dot, what happened, one detail (Figma Event row 46:2165). */
export function EventRow({
  kind = "info",
  time,
  dateTime,
  title,
  detail,
  kindLabel,
  className,
  ...props
}: EventRowProps) {
  return (
    <div
      data-kind={kind}
      className={cn("flex items-start gap-3.5 py-2.5 text-fg-primary", className)}
      {...props}
    >
      <time dateTime={dateTime} className="w-16 shrink-0 opacity-58 type-ui-mono">
        {time}
      </time>
      <span className="flex h-3.75 w-2.5 shrink-0 items-end">
        {kindLabel === undefined ? (
          <span aria-hidden="true" className={dot({ kind })} />
        ) : (
          <span role="img" aria-label={kindLabel} className={dot({ kind })} />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 overflow-clip">
        <p className="type-label-m">{title}</p>
        {detail === undefined ? null : <p className="opacity-58 type-ui-caption">{detail}</p>}
      </div>
    </div>
  );
}
