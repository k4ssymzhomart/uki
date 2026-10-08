"use server";

import { PilotRequestInput, PilotRequestOutput } from "@uki/contracts";
import { unstable_rethrow } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import { checkPilotValues, type PilotForm, type PilotFormState, pilotValues } from "./pilot-model.ts";

/**
 * Book a pilot's server action. Checks the form again, then calls request_pilot as the visitor
 * (publishable key, no session) with its arguments checked by the PilotRequest contract: the RPC
 * stores the row, refuses a fourth request from one address within 24 hours, and its trigger asks
 * pilot-notify to email the team. Sent replaces the form; a refusal or a failure keeps what was typed.
 */
export async function requestPilot(_previous: PilotFormState, form: FormData): Promise<PilotFormState> {
  const values = pilotValues(form);
  const checked = checkPilotValues(values);
  if (!checked.ok) return { status: "editing", values, errors: checked.errors };
  try {
    const args = PilotRequestInput.parse(requestPilotArgs(checked.request));
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("request_pilot", args);
    const reply = PilotRequestOutput.safeParse(data);
    if (error || !reply.success) return { status: "failed", values, errors: {} };
    if (reply.data.status === "rate_limited") return { status: "rateLimited", values, errors: {} };
    return { status: "sent", request: checked.request, reference: null };
  } catch (error) {
    unstable_rethrow(error);
    return { status: "failed", values, errors: {} };
  }
}

/** The form as request_pilot's arguments: size and month as their stable values ("from100", "2026-11"). */
function requestPilotArgs(request: PilotForm): PilotRequestInput {
  return {
    name: request.name,
    email: request.email,
    university: request.university,
    role: request.role,
    ...(request.message === "" ? {} : { message: request.message }),
    exam_size: request.students,
    pilot_month: request.when,
    demo_invite: request.demoDay,
  };
}
