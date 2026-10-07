import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";
import { Field, fieldBoxVariants, fieldState } from "./field.tsx";

export type TextAreaProps = ComponentProps<"textarea"> & {
  label: ReactNode;
  /** Caption under the field; Figma puts the character counter here, for example "55/500". */
  helper?: ReactNode;
  /** Error message: sets State=Error and aria-invalid, and replaces the helper. */
  error?: ReactNode;
  trailingIcon?: IconName;
  /** Classes for the outer column. */
  className?: string;
  /** Classes for the <textarea> itself. */
  textareaClassName?: string;
};

/** Multi-line text field, 112 px tall (Figma Text area 143:13134); same states as Input. */
export function TextArea({
  label,
  helper,
  error,
  trailingIcon,
  disabled,
  id,
  className,
  textareaClassName,
  "aria-describedby": describedBy,
  ...props
}: TextAreaProps) {
  const autoId = useId();
  const controlId = id ?? `${autoId}-textarea`;
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
      <div className={fieldBoxVariants({ state, multiline: true })}>
        <textarea
          id={controlId}
          disabled={disabled}
          aria-invalid={state === "error" || undefined}
          aria-describedby={describes}
          className={cn(
            "h-full min-w-0 flex-1 resize-none bg-transparent type-body-s text-fg-primary outline-none placeholder:text-fg-primary/50",
            "disabled:cursor-not-allowed disabled:opacity-45",
            textareaClassName,
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
