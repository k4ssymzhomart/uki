"use client";

import type { StaffRole } from "@uki/contracts";
import { createContext, use } from "react";

/** Who is signed in, as the shell and the page headers show it. */
export type StaffIdentity = {
  initials: string;
  fullName: string;
  email: string | null;
  role: StaffRole;
  workspaceName: string;
  facultyName: string | null;
};

export const StaffContext = createContext<StaffIdentity | null>(null);

/** The signed-in staff member; only inside the (app) layout's AppShell. */
export function useStaff(): StaffIdentity {
  const staff = use(StaffContext);
  if (!staff) throw new Error("useStaff() outside AppShell");
  return staff;
}
