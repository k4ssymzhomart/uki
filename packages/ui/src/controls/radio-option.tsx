import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../cn.ts";

export type RadioOptionProps = Omit<
  ComponentProps<typeof RadioGroupPrimitive.Item>,
  "children" | "asChild" | "title"
> & {
  title: ReactNode;
  detail?: ReactNode;
};

/**
 * Selectable option card (Figma Radio option 49:2188), an item of <RadioGroup>.
 * Selected: brand-subtle card with a strong stroke and a filled radio; otherwise a surface card.
 */
export function RadioOption({ title, detail, className, disabled, ...props }: RadioOptionProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const detailId = `${id}-detail`;
  return (
    <RadioGroupPrimitive.Item
      disabled={disabled}
      aria-labelledby={titleId}
      aria-describedby={detail ? detailId : undefined}
      className={cn(
        "group flex w-full cursor-pointer items-start gap-3 rounded-md px-4 py-3.5 text-left text-fg-primary outline-none transition-colors",
        "bg-surface inset-ring inset-ring-line-default",
        "data-[state=checked]:bg-brand-subtle data-[state=checked]:inset-ring-2 data-[state=checked]:inset-ring-line-strong",
        "focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-pill bg-surface inset-ring-2 inset-ring-line-strong/45",
          "group-data-[state=checked]:inset-ring-line-strong",
        )}
      >
        <RadioGroupPrimitive.Indicator className="size-2.5 rounded-pill bg-inverse" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={titleId} className="type-label-m">
          {title}
        </span>
        {detail ? (
          <span id={detailId} className="type-ui-caption">
            {detail}
          </span>
        ) : null}
      </span>
    </RadioGroupPrimitive.Item>
  );
}
