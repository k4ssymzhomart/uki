// Who may call an Edge Function: serveApi's `auth` option (docs/phase-1-plan.md, "Additions to the data
// model") and the withSupabase setting each one becomes. Pure, so the functions-unit tests run it under
// Node.
//
//   user    a signed-in user's token (staff or a student's anonymous sign-in): ingest, frames, command,
//           stills, send-invites, data-request. The default; Phase 0's four functions use it.
//   none    no credential: shared-report, which the Next.js server calls for /r/[token] and which checks
//           the share token itself.
//   secret  a secret key in the `apikey` header: retention (pg_cron) and pilot-notify (the
//           pilot_requests trigger), both called through pg_net with the key kept in Vault.

export const API_AUTH_MODES = ["user", "none", "secret"] as const;
export type ApiAuth = (typeof API_AUTH_MODES)[number];

/**
 * The withSupabase `auth` value. `secret` accepts any of the project's secret keys (`secret:*`): bare
 * `secret` would match only the key named `default`, so rotating the secret key under another name
 * (P.17) would silently lock out the nightly retention run and the pilot emails.
 */
export function withSupabaseAuth(auth: ApiAuth): "user" | "none" | "secret:*" {
  switch (auth) {
    case "user":
      return "user";
    case "none":
      return "none";
    case "secret":
      return "secret:*";
  }
}

/** Only `user` functions need a user's token (and check its role); the others never read claims. */
export function needsUserToken(auth: ApiAuth): boolean {
  return auth === "user";
}
