import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/proxy.ts";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except build assets, image optimisation and static files: the /try models, the service
  // worker and the manifest never need a session.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|models/|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
