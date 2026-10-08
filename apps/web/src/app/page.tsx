import { redirect } from "next/navigation";
import { staffHomePath } from "../features/shell/shell-model.ts";
import { getStaffMember } from "../lib/auth.ts";

/**
 * `/` sends everyone without a staff session to sign-in and staff to their home: the overview, or a
 * proctor's /my-exams once WP 1.5 turns PROCTORS_LAND_ON_MY_EXAMS on. A failed lookup goes to the
 * overview, which looks again and shows Try again rather than bouncing a signed-in proctor.
 */
export default async function HomePage() {
  const lookup = await getStaffMember();
  if (lookup.status === "none") redirect("/sign-in");
  redirect(lookup.status === "staff" ? staffHomePath(lookup.staff.role) : "/overview");
}
