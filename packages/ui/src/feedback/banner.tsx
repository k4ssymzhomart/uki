import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";

export type BannerKind = "info" | "warn" | "error" | "offline";

const bannerVariants = cva("flex w-full items-center gap-3.5 rounded-md py-3.5 pr-3.5 pl-4 text-fg-primary", {
  variants: {
    kind: {
      info: "bg-brand-subtle",
      warn: "bg-warn-subtle",
      error: "bg-flag-subtle",
      offline: "bg-subtle",
    },
  },
  defaultVariants: { kind: "info" },
});

const KIND_ICON: Record<BannerKind, IconName> = {
  info: "info",
  warn: "alert",
  error: "alert",
  offline: "cloud-off",
};

export type BannerProps = Omit<ComponentProps<"div">, "title"> & {
  kind?: BannerKind;
  title: ReactNode;
  body?: ReactNode;
  /** Usually a <Button variant="secondary">; Figma shows none on Offline. */
  action?: ReactNode;
  /** Overrides the kind's icon. */
  icon?: IconName;
};

/**
 * Inline page banner for status, warnings, load errors and offline mode (Figma Banner 145:2770).
 * Error and Warn are announced as alerts; Info and Offline as status.
 */
export function Banner({ kind = "info", title, body, action, icon, className, ...props }: BannerProps) {
  const urgent = kind === "error" || kind === "warn";
  return (
    <div
      role={urgent ? "alert" : "status"}
      data-kind={kind}
      className={cn(bannerVariants({ kind }), className)}
      {...props}
    >
      <Icon name={icon ?? KIND_ICON[kind]} className="size-5" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="type-label-m">{title}</p>
        {body ? <p className="type-card-caption opacity-72">{body}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
    </div>
  );
}
