import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

export type AppTopBarProps = Omit<ComponentProps<"header">, "children" | "title"> & {
  /** "Exams / Mathematics 2"; may contain links. */
  breadcrumb?: ReactNode;
  /** The page title, rendered as the page's h1: "Live wall". */
  title: ReactNode;
  /** Right side, in Figma order: <SearchField />, the notifications IconButton, <Avatar size="lg" tone="ink" />. */
  actions?: ReactNode;
};

/** Dashboard top bar: breadcrumb, page title, search, notifications, account (Figma App/Top bar 47:2201). */
export function AppTopBar({ breadcrumb, title, actions, className, ...props }: AppTopBarProps) {
  return (
    <header
      className={cn(
        "flex h-20 w-full shrink-0 items-center gap-3 border-b border-line-default bg-canvas px-8 text-fg-primary",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 overflow-clip whitespace-nowrap">
        {breadcrumb === undefined ? null : <div className="type-ui-caption">{breadcrumb}</div>}
        <h1 className="type-ui-title">{title}</h1>
      </div>
      {actions}
    </header>
  );
}
