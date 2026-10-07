import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

export type StatTileProps = Omit<ComponentProps<"div">, "children"> & {
  /** Mono overline, upper-cased by the style: "Live now". */
  label: ReactNode;
  /** The number: "128". */
  value: ReactNode;
  /** One line under the number: "3 groups · 2 proctors". */
  caption?: ReactNode;
};

/** One number with a label and a one-line caption; use in rows of three or four (Figma Stat tile 40:2061). */
export function StatTile({ label, value, caption, className, ...props }: StatTileProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-start gap-2 rounded-md border border-line-default bg-surface p-6 text-fg-primary",
        className,
      )}
      {...props}
    >
      <p className="opacity-58 type-mono-tag">{label}</p>
      <p className="type-h3">{value}</p>
      {caption === undefined ? null : <p className="opacity-58 type-ui-caption">{caption}</p>}
    </div>
  );
}
