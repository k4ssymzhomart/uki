import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Avatar } from "./avatar.tsx";
import { Chip, type ChipStatus } from "./chip.tsx";
import { rowSessionColumns as columns } from "./columns.ts";
import { Count, type CountTone } from "./count.tsx";

export type RowSessionProps = Omit<ComponentProps<"tr">, "children"> & {
  initials: ReactNode;
  name: ReactNode;
  studentId: ReactNode;
  /** Number of flags: "3". */
  flagCount: ReactNode;
  flagTone?: CountTone;
  /** The top flag: "Phone in frame · 0.94". */
  topFlag?: ReactNode;
  /** "88 min". */
  duration: ReactNode;
  status: ChipStatus;
  /** "Needs review". */
  statusLabel: ReactNode;
  /** Usually <RowAction icon="arrow-right" iconPosition="end" asChild><a href>Review</a></RowAction>. */
  action?: ReactNode;
  /** Wraps the flag count and top flag, for example in a FlagPreview trigger (3.2b). */
  renderFlags?: (flags: ReactElement) => ReactNode;
};

/**
 * Review queue row: student, flag count with the top flag, time, status chip, action
 * (Figma Row/Session 50:2191). A <tr> with five cells; place it in a Table's <tbody>.
 */
export function RowSession({
  initials,
  name,
  studentId,
  flagCount,
  flagTone = "flag",
  topFlag,
  duration,
  status,
  statusLabel,
  action,
  renderFlags,
  className,
  ...props
}: RowSessionProps) {
  const flags = (
    <div className="flex min-w-0 items-center gap-2.5 overflow-clip">
      <Count tone={flagTone}>{flagCount}</Count>
      {topFlag === undefined ? null : <p className="whitespace-nowrap type-ui-caption">{topFlag}</p>}
    </div>
  );
  return (
    <tr className={cn("h-19 border-b border-line-default bg-surface text-fg-primary", className)} {...props}>
      <td className={cn(columns.student, "pl-5 align-middle")}>
        <div className="flex min-w-0 items-center gap-3 overflow-clip">
          <Avatar tone="paper" size="md" initials={initials} />
          <div className="flex min-w-0 flex-col items-start overflow-clip whitespace-nowrap">
            <p className="type-label-m">{name}</p>
            <p className="type-ui-mono">{studentId}</p>
          </div>
        </div>
      </td>
      <td className={cn(columns.flags, "pl-5 align-middle")}>{renderFlags ? renderFlags(flags) : flags}</td>
      <td className={cn(columns.duration, "whitespace-nowrap pl-5 align-middle type-ui-mono")}>{duration}</td>
      <td className={cn(columns.status, "pl-5 align-middle")}>
        <Chip status={status}>{statusLabel}</Chip>
      </td>
      <td className="pr-5 pl-5 text-right align-middle">{action}</td>
    </tr>
  );
}
