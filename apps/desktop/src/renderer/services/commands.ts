// Proctor commands ("Proctor commands" in docs/phase-0-plan.md). The app joins session:{session_id}
// right after join; each command applies once by id (the outbox's commands table); on every
// (re)connect it reads session_commands rows with no acked_at and applies them in order; it acks by
// setting acked_at, which a column grant and a policy allow on its own session.
import { Command, type CommandMessage, type SessionCommandRow, toMs } from "@uki/contracts";
import type { Outbox } from "../outbox/outbox.ts";
import type { RealtimeStatus, StudentApi } from "./student-api.ts";

/** A command as the flow applies it. `issuedAt` is server ms; `byName` is null on catch-up reads. */
export type FlowCommand = Command & { id: string; issuedAt: number; byName: string | null };

export interface CommandRouterOptions {
  api: Pick<StudentApi, "unackedCommands" | "ackCommand" | "subscribeCommands">;
  outbox: Outbox;
  sessionId: string;
  /** Applies one command to the flow. Called once per command id, in order. */
  apply: (command: FlowCommand) => void;
  onStatus?: (status: RealtimeStatus) => void;
  /** Laptop clock, default Date.now. */
  now?: () => number;
}

function toFlowCommand(
  source: CommandMessage | SessionCommandRow,
  byName: string | null,
): FlowCommand | null {
  const command = Command.safeParse({ type: source.type, payload: source.payload });
  if (!command.success) return null;
  return { ...command.data, id: source.id, issuedAt: toMs(source.issued_at), byName };
}

export class CommandRouter {
  private readonly options: CommandRouterOptions;
  private readonly now: () => number;
  private queue: Promise<void> = Promise.resolve();
  private subscription: { close(): void } | null = null;
  private stopped = false;
  private catchingUp = false;

  constructor(options: CommandRouterOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  /** Joins the channel; every SUBSCRIBED (first join and each rejoin) triggers a catch-up read. */
  async start(): Promise<void> {
    this.stopped = false;
    this.subscription = await this.options.api.subscribeCommands(this.options.sessionId, {
      onCommand: (message) => {
        const command = toFlowCommand(message, message.by_name);
        if (command) void this.handle(command);
      },
      onStatus: (status) => {
        this.options.onStatus?.(status);
        if (status === "SUBSCRIBED") void this.catchUp();
      },
    });
  }

  stop(): void {
    this.stopped = true;
    this.subscription?.close();
    this.subscription = null;
  }

  /** Reads unacked commands and applies or acks them in order. Also called after a network cut. */
  async catchUp(): Promise<void> {
    if (this.stopped || this.catchingUp) return;
    this.catchingUp = true;
    try {
      const rows = await this.options.api.unackedCommands(this.options.sessionId);
      for (const row of rows) {
        const command = toFlowCommand(row, null);
        if (command) await this.handle(command);
      }
    } catch {
      // Offline: the next SUBSCRIBED or reconnect reads again.
    } finally {
      this.catchingUp = false;
    }
  }

  /** Applies a command once and acks it; serialized so commands apply in arrival order. */
  handle(command: FlowCommand): Promise<void> {
    const next = this.queue.then(() => this.process(command));
    this.queue = next.catch(() => {});
    return next;
  }

  private async process(command: FlowCommand): Promise<void> {
    if (this.stopped) return;
    const { outbox, sessionId } = this.options;
    const existing = await outbox.command(command.id);
    if (!existing) {
      // Apply first, then record: a crash in between applies it again after the restart, which every
      // command tolerates, while the reverse order could lose it.
      this.options.apply(command);
      await outbox.recordCommand({
        id: command.id,
        sessionId,
        type: command.type,
        payload: command.payload,
        issuedAt: command.issuedAt,
        byName: command.byName,
        appliedAt: this.now(),
        ackedAt: null,
      });
    } else if (existing.ackedAt !== null) {
      return;
    }
    try {
      await this.options.api.ackCommand(command.id, new Date(this.now()).toISOString());
      await outbox.markCommandAcked(command.id);
    } catch {
      // Not acked yet: the next catch-up acks it without applying it again.
    }
  }
}
