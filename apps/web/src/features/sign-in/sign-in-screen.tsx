"use client";

import { Button, Checkbox, Input } from "@uki/ui";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { BrandPanel } from "./brand-panel.tsx";
import { PasswordField } from "./password-field.tsx";
import { INITIAL_SIGN_IN_STATE, type SignInState } from "./sign-in-form.ts";

export type SignInAction = (previous: SignInState, form: FormData) => Promise<SignInState>;

export type SignInScreenProps = {
  action: SignInAction;
  /** The email field's first value: `?email=`, already checked (sign-in-query.ts). */
  email?: string;
  /** Where to go after sign-in: `?next=`, already checked; the action checks it again. */
  next?: string | null;
};

/**
 * A.0 Sign in (Figma 177:15946). Phase 0 hides the language switch (Russian arrives in Phase 1) and
 * "Forgot password?" (A.0a ships in Phase 2); a spacer keeps the form where Figma puts it. The judge
 * path (no frame) fills in the email from `?email=` and carries `?next=` in a hidden field.
 */
export function SignInScreen({ action, email = "", next = null }: SignInScreenProps) {
  const t = useTranslations("dashboard.signIn");
  const [state, formAction, pending] = useActionState(action, { ...INITIAL_SIGN_IN_STATE, email });
  const [keep, setKeep] = useState(state.keep);
  const emailError = state.errors.email;
  const passwordError = state.errors.password;

  return (
    <main className="flex h-screen min-h-175 bg-canvas text-fg-primary">
      <BrandPanel />
      <div className="flex min-w-0 flex-1 flex-col items-center justify-between overflow-y-auto px-16 py-12">
        <span aria-hidden="true" className="h-7.75 w-full shrink-0" />
        <form action={formAction} noValidate className="flex w-100 max-w-full flex-col gap-7">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <div className="flex flex-col gap-2.5">
            <h1 className="type-h2">{t("title")}</h1>
            <p className="opacity-72 type-body-m">{t("lead")}</p>
          </div>
          <div className="flex flex-col gap-4">
            <Input
              label={t("email")}
              name="email"
              type="email"
              autoComplete="username"
              required
              defaultValue={state.email}
              error={emailError ? t(`error.${emailError}`) : undefined}
            />
            <PasswordField
              label={t("password")}
              name="password"
              autoComplete="current-password"
              required
              showLabel={t("showPassword")}
              hideLabel={t("hidePassword")}
              error={passwordError ? t(`error.${passwordError}`) : undefined}
            />
          </div>
          <div className="flex items-center justify-between">
            <Checkbox
              name="keep"
              value="on"
              checked={keep}
              onCheckedChange={(checked) => setKeep(checked === true)}
              label={t("keep")}
            />
          </div>
          <Button type="submit" loading={pending} className="w-full">
            {t("submit")}
          </Button>
          <p className="opacity-64 type-card-caption">{t("noAccount")}</p>
        </form>
        <footer className="flex w-full shrink-0 items-start justify-between type-card-caption">
          <p className="opacity-56">{t("copyright")}</p>
          <p className="whitespace-pre opacity-56">{t("legal")}</p>
        </footer>
      </div>
    </main>
  );
}
