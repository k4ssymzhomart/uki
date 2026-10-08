"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_S } from "../../i18n/locale.ts";
import { LANDING_LOCALES } from "./landing-model.ts";

const LocaleForm = z.object({ locale: z.enum(LANDING_LOCALES) });

/**
 * The РУС and ENG buttons of the public header and footer. Writes the `uki_locale` cookie that
 * src/i18n/request.ts reads per request, with the options of 3.4a's switch (shell/preferences.ts), whose
 * action needs a staff session; the page renders again in that language. Anything other than a known
 * language is ignored.
 */
export async function setLandingLocale(form: FormData): Promise<void> {
  const parsed = LocaleForm.safeParse({ locale: form.get("locale") });
  if (!parsed.success) return;
  (await cookies()).set(LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE_S,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
