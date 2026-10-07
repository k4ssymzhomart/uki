import { redirect } from "next/navigation";
import { getStaffMember } from "../lib/auth.ts";

/** `/` sends signed-in staff to the overview and everyone else to sign-in. */
export default async function HomePage() {
  redirect((await getStaffMember()) ? "/overview" : "/sign-in");
}
