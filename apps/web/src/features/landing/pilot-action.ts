"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import { checkPilotValues, type PilotForm, type PilotFormState, pilotValues } from "./pilot-model.ts";

/**
 * request_pilot's answer (20261009000000_phase1.sql, WP 1.1): `{ status: "ok" }`, or
 * `{ status: "rate_limited" }` for a fourth request from one address within 24 hours. Anything else,
 * including its `bad_request` error, is a failure.
 */
const RequestPilotReply = z.object({ status: z.enum(["ok", "rate_limited"]) });

/** The RPC's arguments: the plan's five, plus the frame's size, month and Demo Day choice. */
export type RequestPilotArgs = {
  name: string;
  email: string;
  university: string;
  role: string;
  message: string | null;
  exam_size: string;
  pilot_month: string;
  demo_invite: boolean;
};

/**
 * Book a pilot's server action. Checks the form again, then calls request_pilot as the visitor
 * (publishable key, no session): the RPC stores the row, enforces the daily limit, and its trigger asks
 * pilot-notify to email the team. Sent replaces the form; a refusal or a failure keeps what was typed.
 */
export async function requestPilot(_previous: PilotFormState, form: FormData): Promise<PilotFormState> {
  const values = pilotValues(form);
  const checked = checkPilotValues(values);
  if (!checked.ok) return { status: "editing", values, errors: checked.errors };
  try {
    const supabase = await createSupabaseServerClient();
    // request_pilot arrives with WP 1.1; until its types are generated the call is untyped, and the
    // reply is checked here.
    const rpc = supabase.rpc as unknown as (
      fn: "request_pilot",
      args: RequestPilotArgs,
    ) => Promise<{ data: unknown; error: unknown }>;
    const { data, error } = await rpc.call(supabase, "request_pilot", requestPilotArgs(checked.request));
    const reply = RequestPilotReply.safeParse(data);
    if (error || !reply.success) return { status: "failed", values, errors: {} };
    if (reply.data.status === "rate_limited") return { status: "rateLimited", values, errors: {} };
    return { status: "sent", request: checked.request, reference: null };
  } catch (error) {
    unstable_rethrow(error);
    return { status: "failed", values, errors: {} };
  }
}

/** The form as request_pilot's arguments: size and month as their stable values ("from100", "2026-11"). */
function requestPilotArgs(request: PilotForm): RequestPilotArgs {
  return {
    name: request.name,
    email: request.email,
    university: request.university,
    role: request.role,
    message: request.message === "" ? null : request.message,
    exam_size: request.students,
    pilot_month: request.when,
    demo_invite: request.demoDay,
  };
}
