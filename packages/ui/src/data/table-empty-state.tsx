import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

export type TableEmptyStateProps = Omit<ComponentProps<"div">, "children" | "title"> & {
  /** The 128 px mascot, for example the approve pose from @uki/ui/art. */
  art?: ReactNode;
  /** "Nothing to review". */
  title: ReactNode;
  /** One-line reason: "All 125 sessions are clear or decided. New flags show up here." */
  body?: ReactNode;
  /** One next step, usually a Secondary Button. */
  action?: ReactNode;
};

/** Empty table or list: mascot, one-line reason, one next step (Figma Table/Empty state 149:2792). */
export function TableEmptyState({ art, title, body, action, className, ...props }: TableEmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center gap-3 py-12 text-center text-fg-primary", className)}
      {...props}
    >
      {art === undefined ? null : (
        <div className="flex size-32 shrink-0 items-center justify-center">{art}</div>
      )}
      <p className="type-ui-title">{title}</p>
      {body === undefined ? null : <p className="opacity-72 type-body-s">{body}</p>}
      {action}
    </div>
  );
}
