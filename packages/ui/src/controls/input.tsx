import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";
import { Field, fieldBoxVariants, fieldState } from "./field.tsx";

export type InputProps = Omit<ComponentProps<"input">, "size"> & {
  label: ReactNode;
  /** Caption under the field (Figma Helper). */
  helper?: ReactNode;
  /** Error message: sets State=Error and aria-invalid, and replaces the helper. */
  error?: ReactNode;
  /** 20 px icon at the end of the field (Figma Trailing icon). */
  trailingIcon?: IconName;
  /** Classes for the outer column (label, field, helper). Width defaults to the parent's. */
  className?: string;
  /** Classes for the <input> itself. */
  inputClassName?: string;
};

/** Labelled text field (Figma Input 142:13172): Default, Focus, Error and Disabled. */
export function Input({
  label,
  helper,
  error,
  trailingIcon,
  disabled,
  id,
  className,
  inputClassName,
  "aria-describedby": describedBy,
  ...props
}: InputProps) {
  const autoId = useId();
  const controlId = id ?? `${autoId}-input`;
  const messageId = `${autoId}-message`;
  const state = fieldState({ error, disabled });
  const message = state === "error" ? error : helper;
  const describes = [describedBy, message ? messageId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <Field
      controlId={controlId}
      messageId={messageId}
      label={label}
      helper={helper}
      error={error}
      state={state}
      className={className}
    >
      <div className={fieldBoxVariants({ state })}>
        <input
          id={controlId}
          disabled={disabled}
          aria-invalid={state === "error" || undefined}
          aria-describedby={describes}
          className={cn(
            "min-w-0 flex-1 bg-transparent type-body-s text-fg-primary outline-none placeholder:text-fg-primary/50",
            "disabled:cursor-not-allowed disabled:opacity-45",
            inputClassName,
          )}
          {...props}
        />
        {trailingIcon ? (
          <Icon name={trailingIcon} className={cn("size-5", disabled && "opacity-45")} />
        ) : null}
      </div>
    </Field>
  );
}
