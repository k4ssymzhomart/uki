// The session's unacked commands for the ingest reply (`IngestResponse.pending_commands`), checked one
// by one: a row that fails CommandBroadcast is left out (and logged) instead of failing the reply,
// because a failed ingest reply would show the student as offline. Pure, so Vitest runs it under Node.
import { CommandBroadcast, PENDING_COMMANDS_MAX } from "../_shared/contracts/index.ts";
import { summarizeIssues } from "../_shared/errors.ts";

/** Valid commands in their order, at most PENDING_COMMANDS_MAX; `onDropped` hears about the rest. */
export function pendingCommands(
  rows: readonly unknown[],
  onDropped: (issues: string) => void = () => {},
): CommandBroadcast[] {
  const commands: CommandBroadcast[] = [];
  for (const row of rows) {
    const parsed = CommandBroadcast.safeParse(row);
    if (parsed.success) commands.push(parsed.data);
    else onDropped(summarizeIssues(parsed.error.issues));
  }
  return commands.slice(0, PENDING_COMMANDS_MAX);
}
