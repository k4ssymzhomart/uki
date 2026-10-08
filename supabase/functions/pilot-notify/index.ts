// POST /functions/v1/pilot-notify: emails the Üki team one Book a pilot request (Phase 1 plan,
// "Pilot requests" and Edge Functions). Called by the pilot_requests trigger through pg_net with the
// secret key from Vault (call_edge_function in 20261009000000_phase1.sql), so `auth: "secret"`.
//
// Environment (Supabase secrets): RESEND_API_KEY, UKI_EMAIL_SINK (the team's inbox), optional
// UKI_EMAIL_FROM (Resend's onboarding@resend.dev until a domain is verified) and RESEND_BASE_URL (a
// stub in tests). The visitor is the Reply-To, so answering the email reaches them.
import { z } from "zod";
import { PilotNotifyInput, PilotRequest } from "../_shared/contracts/index.ts";
import { ApiFailure, fromDatabaseError } from "../_shared/errors.ts";
import { serveApi } from "../_shared/http.ts";
import { parseRow } from "../_shared/rows.ts";
import { pilotEmail } from "./email.ts";
import { RESEND_API, ResendError, sendResendEmail } from "./resend.ts";

const DEFAULT_FROM = "Üki <onboarding@resend.dev>";

const PilotNotifyOutput = z.object({ id: z.string() });

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new ApiFailure("internal", `${name} is not set`);
  return value;
}

Deno.serve(
  serveApi({
    name: "pilot-notify",
    auth: "secret",
    input: PilotNotifyInput,
    output: PilotNotifyOutput,
    async handle(input, ctx) {
      const found = await ctx.supabaseAdmin
        .from("pilot_requests")
        .select("id, name, email, university, role, message, exam_size, pilot_month, demo_invite, created_at")
        .eq("id", input.id)
        .maybeSingle();
      if (found.error) throw fromDatabaseError(found.error, "pilot_requests");
      if (found.data === null) throw new ApiFailure("not_found", "no such pilot request");
      const request = parseRow(PilotRequest, found.data, "pilot_requests");

      const { subject, text } = pilotEmail(request);
      try {
        const id = await sendResendEmail(
          {
            from: Deno.env.get("UKI_EMAIL_FROM") || DEFAULT_FROM,
            to: required("UKI_EMAIL_SINK"),
            replyTo: request.email,
            subject,
            text,
          },
          { apiKey: required("RESEND_API_KEY"), baseUrl: Deno.env.get("RESEND_BASE_URL") || RESEND_API },
        );
        return { id };
      } catch (error) {
        if (error instanceof ResendError)
          throw new ApiFailure("internal", `Resend ${error.status}: ${error.message}`);
        throw error;
      }
    },
  }),
);
