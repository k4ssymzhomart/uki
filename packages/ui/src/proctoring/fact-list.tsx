import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

export interface Fact {
  id: string;
  label: ReactNode;
  value: ReactNode;
}

export interface FactListProps extends Omit<ComponentProps<"dl">, "children"> {
  facts: readonly Fact[];
  /** Opacity class of the labels: Popover/Student uses 58 %, Ext/Popup · Released 60 %. */
  labelClassName?: string;
}

/** Key and value rows on a bg-subtle well (the Facts block of Popover/Student and Ext/Popup · Released). */
export function FactList({ facts, labelClassName = "opacity-60", className, ...props }: FactListProps) {
  return (
    <dl
      className={cn("flex w-full flex-col rounded-sm bg-subtle px-3 py-1 text-fg-primary", className)}
      {...props}
    >
      {facts.map((fact) => (
        <div
          key={fact.id}
          className="flex items-center gap-2 border-line-default border-b py-2 last:border-b-0"
        >
          <dt className={cn("type-ui-caption min-w-0 flex-1", labelClassName)}>{fact.label}</dt>
          <dd className="type-ui-label whitespace-nowrap">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
