import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { staffHomePath } from "../../../features/shell/shell-model.ts";
import { SignInScreen } from "../../../features/sign-in/sign-in-screen.tsx";
import { getStaffMember } from "../../../lib/auth.ts";
import { signIn } from "./actions.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.signIn");
  return { title: t("submit") };
}

/**
 * A.0 Sign in (Figma 177:15946). Signed-in staff go straight to their home. When the lookup failed,
 * the form still shows, so signing in again is always a way forward.
 */
export default async function SignInPage() {
  const lookup = await getStaffMember();
  if (lookup.status === "staff") redirect(staffHomePath(lookup.staff.role));
  return <SignInScreen action={signIn} />;
}
