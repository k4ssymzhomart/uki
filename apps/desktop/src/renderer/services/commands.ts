// Proctor commands ("Proctor commands" in docs/phase-0-plan.md). The app joins session:{session_id}
// right after join; each command applies once by id (the outbox's commands table); on every
// (re)connect it reads session_commands rows with no acked_at and applies them in order; it acks by
// setting acked_at, which a column grant and a policy allow on its own session. Every ingest reply also
// carries the session's unacked commands (pending_commands): the heartbeat delivers a command whose
// broadcast was lost while the channel looked connected, and the broadcast stays the fast path.
import { Command, type CommandMessage, type SessionCommandRow, toMs } from "@uki/contracts";
import type { Outbox } from "../outbox/outbox.ts";
import type { RealtimeStatus, StudentApi } from "./student-api.ts";

/**
 * A command as the flow applies it. `issuedAt` is server ms; `byName` is the issuer's name, null when
 * the server sent none (the flow then names the lead proctor).
 */
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

function toFlowCommand(source: CommandMessage | SessionCommandRow): FlowCommand | null {
  const command = Command.safeParse({ type: source.type, payload: source.payload });
  if (!command.success) return null;
  const byName = source.by_name?.trim() || null;
  return { ...command.data, id: source.id, issuedAt: toMs(source.issued_at), byName };
}

export class CommandRouter {
  private readonly options: CommandRouterOptions;
  private readonly now: () => number;
  private queue: Promise<void> = Promise.resolve();
  private subscription: { close(): void } | null = null;
  private stopped = false;
  private catchingUp: Promise<boolean> | null = null;

  constructor(options: CommandRouterOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  /** Joins the channel; every SUBSCRIBED (first join and each rejoin) triggers a catch-up read. */
  async start(): Promise<void> {
    this.stopped = false;
    this.subscription = await this.options.api.subscribeCommands(this.options.sessionId, {
      onCommand: (message) => {
        const command = toFlowCommand(message);
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

  /**
   * Reads unacked commands and applies or acks them in order. Also called after a network cut and when
   * the app restarts into a paused session. A call while a read runs shares it. Resolves true once the
   * list was read and every command in it applied, false when the read failed (offline: the next
   * SUBSCRIBED or reconnect reads again) or the router is stopped.
   */
  catchUp(): Promise<boolean> {
    if (this.stopped) return Promise.resolve(false);
    if (this.catchingUp) return this.catchingUp;
    const run = this.readUnacked().finally(() => {
      this.catchingUp = null;
    });
    this.catchingUp = run;
    return run;
  }

  private async readUnacked(): Promise<boolean> {
    try {
      const rows = await this.options.api.unackedCommands(this.options.sessionId);
      for (const row of rows) {
        const command = toFlowCommand(row);
        if (command) await this.handle(command);
      }
      return !this.stopped;
    } catch {
      return false;
    }
  }

  /**
   * The unacked commands an ingest reply carried (oldest first): each applies once by id, like a
   * broadcast, and is acked; one already applied is only acked again. Commands of another session are
   * ignored.
   */
  async deliver(pending: readonly CommandMessage[]): Promise<void> {
    if (this.stopped) return;
    for (const message of pending) {
      if (message.session_id !== this.options.sessionId) continue;
      const command = toFlowCommand(message);
      if (command) await this.handle(command);
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
