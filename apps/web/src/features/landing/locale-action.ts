"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { LANDING_LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_S } from "./landing-model.ts";

const LocaleForm = z.object({ locale: z.enum(LANDING_LOCALES) });

/**
 * The РУС and ENG buttons of the public header and footer. Writes the language cookie; the page renders
 * again in that language. Anything other than a known language is ignored.
 */
export async function setLandingLocale(form: FormData): Promise<void> {
  const parsed = LocaleForm.safeParse({ locale: form.get("locale") });
  if (!parsed.success) return;
  (await cookies()).set(LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE_S,
    sameSite: "lax",
    httpOnly: true,
  });
}
