import type { Route } from "next";
import { z } from "zod";
import { safeNextPath } from "./sign-in-query.ts";

/**
 * The A.0 form as the sign-in action receives it. Field names match the inputs: email, password and
 * keep (the "Keep me signed in for 12 hours" checkbox, "on" when checked).
 */
export const SignInForm = z.object({
  email: z.string().trim().pipe(z.email()),
  password: z.string().min(1).max(1024),
  keep: z.boolean(),
});
export type SignInForm = z.infer<typeof SignInForm>;

/** Each maps to the key dashboard.signIn.error.<code>. */
export const SIGN_IN_ERRORS = [
  "email",
  "password",
  "credentials",
  "notStaff",
  "rateLimited",
  "unavailable",
] as const;
export type SignInError = (typeof SIGN_IN_ERRORS)[number];

/** What the form shows after an attempt: errors under the fields, and the values to keep. */
export type SignInState = {
  email: string;
  keep: boolean;
  errors: { email?: SignInError; password?: SignInError };
};

export const INITIAL_SIGN_IN_STATE: SignInState = { email: "", keep: true, errors: {} };

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/** Checks the submitted form; on failure returns the state to show, with an error under each bad field. */
export function parseSignInForm(
  form: FormData,
): { ok: true; data: SignInForm } | { ok: false; state: SignInState } {
  const raw = {
    email: text(form.get("email")),
    password: text(form.get("password")),
    keep: form.get("keep") === "on",
  };
  const parsed = SignInForm.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
  return {
    ok: false,
    state: {
      email: raw.email.trim(),
      keep: raw.keep,
      errors: {
        ...(fields.has("email") ? { email: "email" as const } : {}),
        ...(fields.has("password") ? { password: "password" as const } : {}),
      },
    },
  };
}

/** The message for a failed signInWithPassword: wrong credentials, too many tries, or anything else. */
export function signInErrorFromAuth(error: {
  code?: string | undefined;
  status?: number | undefined;
}): SignInError {
  if (error.status === 429 || error.code === "over_request_rate_limit") return "rateLimited";
  if (error.code === "invalid_credentials" || error.code === "email_not_confirmed" || error.status === 400) {
    return "credentials";
  }
  return "unavailable";
}

/** The form's hidden `next` field when it is a safe path on this site (sign-in-query.ts), else null. */
export function signInNext(form: FormData): Route | null {
  return safeNextPath(form.get("next"));
}
