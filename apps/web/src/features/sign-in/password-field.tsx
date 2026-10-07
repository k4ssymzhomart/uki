"use client";

import { cn, Field, fieldBoxVariants, fieldState, Icon } from "@uki/ui";
import { type ComponentProps, type ReactNode, useId, useState } from "react";

export type PasswordFieldProps = Omit<ComponentProps<"input">, "type" | "size"> & {
  label: ReactNode;
  error?: ReactNode;
  /** Accessible names of the eye button. */
  showLabel: string;
  hideLabel: string;
};

/**
 * The A.0 password input (Figma Input 142:13172 with its trailing eye-off icon). The icon is a button
 * that shows or hides the password, so the field is built from @uki/ui's Field and fieldBoxVariants.
 */
export function PasswordField({
  label,
  error,
  showLabel,
  hideLabel,
  disabled,
  id,
  ...props
}: PasswordFieldProps) {
  const autoId = useId();
  const controlId = id ?? `${autoId}-input`;
  const messageId = `${autoId}-message`;
  const [visible, setVisible] = useState(false);
  const state = fieldState({ error, disabled });
  return (
    <Field controlId={controlId} messageId={messageId} label={label} error={error} state={state}>
      <div className={fieldBoxVariants({ state })}>
        <input
          id={controlId}
          type={visible ? "text" : "password"}
          disabled={disabled}
          aria-invalid={state === "error" || undefined}
          aria-describedby={state === "error" ? messageId : undefined}
          className="min-w-0 flex-1 bg-transparent text-fg-primary outline-none type-body-s placeholder:text-fg-primary/50"
          {...props}
        />
        <button
          type="button"
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          aria-controls={controlId}
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
          className={cn(
            "-m-1 flex shrink-0 cursor-pointer items-center justify-center rounded-sm p-1 outline-none focus-visible:shadow-focus",
            disabled && "cursor-not-allowed opacity-45",
          )}
        >
          <Icon name={visible ? "eyes" : "eye-off"} className="size-5" />
        </button>
      </div>
    </Field>
  );
}
