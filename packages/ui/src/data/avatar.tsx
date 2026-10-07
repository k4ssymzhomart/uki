import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

export type AvatarTone = "lime" | "paper" | "ink";
/** sm 32 px (the component), md 36 px (table rows), lg 40 px (top bar). */
export type AvatarSize = "sm" | "md" | "lg";

const avatar = cva("inline-flex shrink-0 select-none items-center justify-center rounded-pill", {
  variants: {
    tone: {
      lime: "bg-brand text-fg-on-brand",
      paper: "bg-subtle text-fg-primary",
      ink: "bg-inverse text-fg-inverse",
    },
    size: {
      sm: "size-8 type-ui-label",
      md: "size-9 type-label-m",
      lg: "size-10 type-label-m",
    },
  },
});

export type AvatarProps = Omit<ComponentProps<"span">, "children"> & {
  /** Lime for the signed-in user, Paper in lists, Ink on light hero areas. */
  tone?: AvatarTone;
  size?: AvatarSize;
  /** One or two letters; see initials() in this folder. */
  initials: ReactNode;
};

/** Initials avatar for students and staff (Figma Avatar 39:2045). */
export function Avatar({ tone = "lime", size = "sm", initials, className, ...props }: AvatarProps) {
  return (
    <span data-tone={tone} className={cn(avatar({ tone, size }), className)} {...props}>
      {initials}
    </span>
  );
}
