import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";
import type { LinkComponent } from "../shell/link.ts";
import { Chip, type ChipStatus } from "./chip.tsx";
import { rowExamColumns as columns } from "./columns.ts";

/** The four checks an exam can run, in Figma order. */
export type ExamCheck = "lock" | "gaze" | "phone" | "id";

const CHECK_ICONS: Record<ExamCheck, IconName> = {
  lock: "lock",
  gaze: "eyes",
  phone: "phone",
  id: "id-card",
};

const CHECK_ORDER: readonly ExamCheck[] = ["lock", "gaze", "phone", "id"];

export type RowExamProps = Omit<ComponentProps<"tr">, "children"> & {
  /** "Mathematics 2 · Midterm". Becomes the row's link when href is set. */
  exam: ReactNode;
  /** "Group 204 · 2 proctors". */
  examDetail?: ReactNode;
  /** "Fri 9 Oct · 10:00" in Asia/Almaty. */
  when: ReactNode;
  /** "90 min". */
  duration?: ReactNode;
  /** "128". */
  students: ReactNode;
  /** Which checks run; all four by default. */
  checks?: Partial<Record<ExamCheck, boolean>>;
  /** Accessible names of the check icons ("Üki Lock", "Gaze", "Phone", "Student card"); unnamed icons are decorative. */
  checkLabels?: Partial<Record<ExamCheck, string>>;
  status: ChipStatus;
  /** "Scheduled", "Live", "Done". */
  statusLabel: ReactNode;
  /**
   * Makes the status chip a button above the row's link, for example 0.9's "Confirm seats", which
   * opens 0.9a while the rest of the row still leads to the exam.
   */
  onStatusClick?: () => void;
  /** Where the row leads, for example the exam's lobby. The whole row becomes clickable. */
  href?: string;
  /** Link component for href, for example Next.js Link. Defaults to "a". */
  linkAs?: LinkComponent;
};

/**
 * Exam office table row (Figma Row/Exam 50:2153). A <tr> with six cells; place it in a Table's <tbody>.
 * With href, the exam name is a link stretched over the whole row.
 */
export function RowExam({
  exam,
  examDetail,
  when,
  duration,
  students,
  checks,
  checkLabels,
  status,
  statusLabel,
  onStatusClick,
  href,
  linkAs: Link = "a",
  className,
  ...props
}: RowExamProps) {
  return (
    <tr
      className={cn(
        "relative h-19 border-b border-line-default bg-surface text-fg-primary",
        href === undefined ? null : "hover:bg-canvas",
        className,
      )}
      {...props}
    >
      <td className={cn(columns.exam, "pl-5 align-middle")}>
        <div className="flex min-w-0 flex-col items-start gap-0.5 overflow-clip whitespace-nowrap">
          {href === undefined ? (
            <p className="type-label-m">{exam}</p>
          ) : (
            <Link
              href={href}
              className="outline-none type-label-m after:absolute after:inset-0 focus-visible:after:shadow-focus"
            >
              {exam}
            </Link>
          )}
          {examDetail === undefined ? null : <p className="type-ui-caption">{examDetail}</p>}
        </div>
      </td>
      <td className={cn(columns.when, "pl-5 align-middle")}>
        <div className="flex min-w-0 flex-col items-start gap-0.5 overflow-clip whitespace-nowrap">
          <p className="type-ui-mono">{when}</p>
          {duration === undefined ? null : <p className="type-ui-caption">{duration}</p>}
        </div>
      </td>
      <td className={cn(columns.students, "whitespace-nowrap pl-5 align-middle type-label-m")}>{students}</td>
      <td className={cn(columns.checks, "pl-5 align-middle")}>
        <div className="flex min-w-0 items-center gap-1.5 overflow-clip">
          {CHECK_ORDER.filter((check) => checks?.[check] ?? true).map((check) => {
            const label = checkLabels?.[check];
            return (
              <span
                key={check}
                data-check={check}
                className="flex size-7.5 shrink-0 items-center justify-center overflow-clip rounded-pill bg-subtle"
              >
                <Icon name={CHECK_ICONS[check]} label={label} className="size-4" />
              </span>
            );
          })}
        </div>
      </td>
      <td className={cn(columns.status, "pl-5 align-middle")}>
        {onStatusClick === undefined ? (
          <Chip status={status}>{statusLabel}</Chip>
        ) : (
          <button
            type="button"
            onClick={onStatusClick}
            className="group relative z-1 cursor-pointer rounded-pill outline-none focus-visible:shadow-focus"
          >
            <Chip status={status} className="transition-colors group-hover:bg-hover group-active:bg-pressed">
              {statusLabel}
            </Chip>
          </button>
        )}
      </td>
      <td className="pr-5 pl-5 text-right align-middle">
        <Icon name="chevron-right" className="ml-auto size-5 opacity-50" />
      </td>
    </tr>
  );
}
