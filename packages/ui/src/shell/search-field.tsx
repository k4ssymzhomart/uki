import type { ComponentProps } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";

export type SearchFieldProps = Omit<ComponentProps<"input">, "type" | "size"> & {
  /** Accessible name; the placeholder alone is not one. */
  label: string;
  /** Classes for the pill around the input (width: w-75 by default, the lobby uses w-60). */
  className?: string;
  inputClassName?: string;
};

/** Pill search field for top bars and table headers (Figma Search field 45:2054, as used in App/Top bar). */
export function SearchField({ label, className, inputClassName, ...props }: SearchFieldProps) {
  return (
    <label
      className={cn(
        "flex w-75 shrink-0 cursor-text items-center gap-2.5 rounded-pill bg-subtle py-2.25 pr-4 pl-3.5 text-fg-primary focus-within:shadow-focus has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className,
      )}
    >
      <Icon name="search" className="size-4.5 opacity-60" />
      <input
        type="search"
        aria-label={label}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-fg-primary outline-none type-body-s placeholder:text-fg-primary/50 disabled:cursor-not-allowed",
          inputClassName,
        )}
        {...props}
      />
    </label>
  );
}
