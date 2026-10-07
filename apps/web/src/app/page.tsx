import { redirect } from "next/navigation";
import { getStaffMember } from "../lib/auth.ts";

/**
 * `/` sends everyone without a staff session to sign-in and everyone else to the overview, including a
 * failed lookup: the overview looks again and shows Try again rather than bouncing a signed-in proctor.
 */
export default async function HomePage() {
  redirect((await getStaffMember()).status === "none" ? "/sign-in" : "/overview");
}
