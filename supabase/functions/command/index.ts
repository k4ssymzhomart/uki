// POST /functions/v1/command: proctor commands from the dashboard ("Endpoints", "Proctor commands" and
// "Actions and dialogs" in docs/phase-0-plan.md).
//
// `{ session_id, type, payload }` for one student, or `{ exam_id, scope: "group", type, payload }` for
// every session of the exam in rules, ready, writing or paused (message and add_time only). The
// function calls `issue_command` with the caller's own client, so `auth.uid()` is the staff member and
// the database checks the rights (proctor of the exam or its exam office), the session state, writes
// the proctor.* event, the session_commands rows (broadcast by commands_broadcast with by_name) and
// one audit row.
//
// Every call carries a request id (the dashboard's, or a UUIDv7 made here). issue_command returns the
// first call's ids for a request id it has seen and writes nothing, so a call that failed at the
// gateway (502, 503, 504: it may or may not have reached Postgres) is sent once more with the same id.
import { CommandRequest, CommandResponse, uuidv7 } from "../_shared/contracts/index.ts";
import { ApiFailure, fromDatabaseError } from "../_shared/errors.ts";
import { type ApiContext, serveApi } from "../_shared/http.ts";
import { retryOnGateway } from "../_shared/retry.ts";
import { parseRow, UuidList } from "../_shared/rows.ts";

async function command(request: CommandRequest, ctx: ApiContext): Promise<CommandResponse> {
  if (ctx.isAnonymous) throw new ApiFailure("forbidden", "students cannot send commands");
  const target =
    "exam_id" in request
      ? { p_exam_id: request.exam_id, p_scope: "group" }
      : { p_session_id: request.session_id, p_scope: "student" };

  const args = {
    ...target,
    p_type: request.type,
    p_payload: request.payload,
    p_request_id: request.request_id ?? uuidv7(),
  };
  const { data, error } = await retryOnGateway(() => ctx.supabase.rpc("issue_command", args));
  if (error) throw fromDatabaseError(error, "issue_command");
  return { command_ids: parseRow(UuidList, data, "issue_command") };
}

Deno.serve(serveApi({ name: "command", input: CommandRequest, output: CommandResponse, handle: command }));
