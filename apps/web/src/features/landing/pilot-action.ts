"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import { checkPilotValues, type PilotForm, type PilotFormState, pilotValues } from "./pilot-model.ts";

/**
 * request_pilot's answer (Phase 1 plan, RPCs): "ok", or "rate_limited" for a fourth request from one
 * address in a day. Anything else is a failure.
 */
const RequestPilotReply = z.enum(["ok", "rate_limited"]);

/** The RPC's arguments: the plan's five, with the frame's size, month and Demo Day choice in `message`. */
export type RequestPilotArgs = {
  name: string;
  email: string;
  university: string;
  role: string;
  message: string;
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
    // request_pilot arrives with WP 1.1 (20261009000000_phase1.sql); until its types are generated the
    // call is untyped, and the reply is checked here.
    const rpc = supabase.rpc as unknown as (
      fn: "request_pilot",
      args: RequestPilotArgs,
    ) => Promise<{ data: unknown; error: unknown }>;
    const { data, error } = await rpc.call(supabase, "request_pilot", requestPilotArgs(checked.request));
    const reply = RequestPilotReply.safeParse(data);
    if (error || !reply.success) return { status: "failed", values, errors: {} };
    if (reply.data === "rate_limited") return { status: "rateLimited", values, errors: {} };
    return { status: "sent", request: checked.request, reference: null };
  } catch (error) {
    unstable_rethrow(error);
    return { status: "failed", values, errors: {} };
  }
}

/** The plan's five arguments. The frame's three extra choices travel in the message, one per line. */
function requestPilotArgs(request: PilotForm): RequestPilotArgs {
  const details = [
    `students=${request.students}`,
    `when=${request.when}`,
    `demo_day=${request.demoDay ? "yes" : "no"}`,
  ];
  return {
    name: request.name,
    email: request.email,
    university: request.university,
    role: request.role,
    message: [request.message, ...details].filter((line) => line !== "").join("\n"),
  };
}
