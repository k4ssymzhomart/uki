import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Avatar } from "./avatar.tsx";
import { Chip, type ChipStatus } from "./chip.tsx";
import { rowLobbyColumns as columns } from "./columns.ts";

export type RowLobbyProps = Omit<ComponentProps<"tr">, "children"> & {
  /** "DK"; see initials(). */
  initials: ReactNode;
  name: ReactNode;
  /** Student number: "20231044". */
  studentId: ReactNode;
  /** Where the student is in check-in: "Identity check". */
  step: ReactNode;
  /** From sessions.status: "Card unreadable · retry 2 of 3". */
  stepDetail?: ReactNode;
  /** From sessions.device: "Windows 11 · Wi-Fi". */
  device?: ReactNode;
  status: ChipStatus;
  /** "Needs help", "Ready", "Not joined". */
  statusLabel: ReactNode;
  /** The quick action, usually <RowAction icon="message">Message</RowAction>. */
  action?: ReactNode;
};

/**
 * Exam-day lobby row: the student, where they are in check-in, their device, status and a quick action
 * (Figma Row/Lobby 50:2214). A <tr> with five cells; place it in a Table's <tbody>.
 */
export function RowLobby({
  initials,
  name,
  studentId,
  step,
  stepDetail,
  device,
  status,
  statusLabel,
  action,
  className,
  ...props
}: RowLobbyProps) {
  return (
    <tr className={cn("h-17 border-b border-line-default bg-surface text-fg-primary", className)} {...props}>
      <td className={cn(columns.student, "pl-5 align-middle")}>
        <div className="flex min-w-0 items-center gap-3 overflow-clip">
          <Avatar tone="paper" size="md" initials={initials} />
          <div className="flex min-w-0 flex-col items-start overflow-clip whitespace-nowrap">
            <p className="type-label-m">{name}</p>
            <p className="type-ui-mono">{studentId}</p>
          </div>
        </div>
      </td>
      <td className={cn(columns.step, "pl-5 align-middle")}>
        <div className="flex min-w-0 flex-col items-start gap-0.5 overflow-clip whitespace-nowrap">
          <p className="type-label-m">{step}</p>
          {stepDetail === undefined ? null : <p className="type-ui-caption">{stepDetail}</p>}
        </div>
      </td>
      <td className={cn(columns.device, "whitespace-nowrap pl-5 align-middle type-ui-caption")}>{device}</td>
      <td className={cn(columns.status, "pl-5 align-middle")}>
        <Chip status={status}>{statusLabel}</Chip>
      </td>
      <td className="pr-5 pl-5 text-right align-middle">{action}</td>
    </tr>
  );
}
