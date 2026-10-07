import type { ComponentProps } from "react";
import { cn } from "../cn.ts";

export type TableSkeletonRowProps = Omit<ComponentProps<"tr">, "children"> & {
  /** Number of columns in the table, so the row spans all of them. */
  colSpan?: number;
};

/**
 * Loading row (Figma Table/Skeleton row 149:2847): a <tr> whose bars are hidden from assistive
 * technology. Show five while a table loads and set aria-busy on the table. Pulses 1 → 0.5 → 1 over 1.2 s.
 */
export function TableSkeletonRow({ colSpan = 1, className, ...props }: TableSkeletonRowProps) {
  return (
    <tr data-skeleton="" className={cn("border-b border-line-default", className)} {...props}>
      <td colSpan={colSpan} className="p-0">
        <div
          aria-hidden="true"
          className="flex items-center gap-5 px-5 py-4 motion-safe:animate-pulse motion-safe:[animation-duration:1.2s]"
        >
          <span className="size-9 shrink-0 rounded-pill bg-subtle" />
          <span className="flex shrink-0 flex-col items-start gap-2 overflow-clip">
            <span className="h-2.5 w-45 rounded-pill bg-subtle" />
            <span className="h-2 w-24 rounded-pill bg-subtle" />
          </span>
          <span className="min-w-0 flex-1" />
          <span className="h-2.5 w-35 shrink-0 rounded-pill bg-subtle" />
          <span className="h-2.5 w-25 shrink-0 rounded-pill bg-subtle" />
          <span className="h-6.5 w-23 shrink-0 rounded-pill bg-subtle" />
        </div>
      </td>
    </tr>
  );
}
