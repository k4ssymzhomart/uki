// `demo:simulate --watch`: listens on the private channel exam:{exam_id} as a proctor of the exam,
// the way the live wall does, and measures how long each simulated event takes from the moment it is
// sent to the moment its broadcast arrives.
import { examTopic, parseExamMessage } from "../../../packages/contracts/src/index.ts";
import type { UkiClient } from "../supabase.ts";
import { Samples } from "./stats.ts";

const MISS_AFTER_MS = 30_000;

export class BroadcastWatch {
  readonly latency = new Samples();
  private readonly pending = new Map<string, number>();
  private received = { event: 0, session: 0, frame: 0, invalid: 0 };
  private missed = 0;
  private channel: ReturnType<UkiClient["channel"]> | null = null;

  constructor(
    private readonly client: UkiClient,
    private readonly accessToken: string,
    private readonly examId: string,
  ) {}

  /** Joins the channel; resolves once Realtime confirms the subscription. */
  async open(timeoutMs = 15_000): Promise<void> {
    await this.client.realtime.setAuth(this.accessToken);
    const channel = this.client.channel(examTopic(this.examId), { config: { private: true } });
    this.channel = channel;
    for (const name of ["event", "session", "frame"] as const) {
      channel.on("broadcast", { event: name }, (message: { payload?: unknown }) =>
        this.onMessage(name, message.payload),
      );
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("watch: no SUBSCRIBED from Realtime in time")),
        timeoutMs,
      );
      channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(new Error(`watch: ${status}${error ? ` ${error.message}` : ""}`));
        }
      });
    });
  }

  /** Remember when an event left the simulator. */
  sent(eventId: string, atMs: number): void {
    this.pending.set(eventId, atMs);
  }

  private onMessage(name: "event" | "session" | "frame", payload: unknown): void {
    const message = parseExamMessage(name, payload);
    if (message === null) {
      this.received.invalid += 1;
      return;
    }
    this.received[name] += 1;
    if (message.event !== "event") return;
    const sentAt = this.pending.get(message.payload.id);
    if (sentAt === undefined) return;
    this.pending.delete(message.payload.id);
    this.latency.add(Date.now() - sentAt);
  }

  /** "events 120 (p50 …) · tiles 300 · missed 0 · invalid 0". */
  describe(): string {
    const now = Date.now();
    for (const [id, at] of this.pending) {
      if (now - at > MISS_AFTER_MS) {
        this.pending.delete(id);
        this.missed += 1;
      }
    }
    const p50 = this.latency.percentile(50);
    const p95 = this.latency.percentile(95);
    const max = this.latency.max();
    const timing =
      p50 === null || p95 === null || max === null
        ? "no samples"
        : `send to broadcast p50 ${Math.round(p50)} ms · p95 ${Math.round(p95)} ms · max ${Math.round(max)} ms`;
    return (
      `watch: ${this.latency.count} events matched (${timing}) · ${this.received.session} tile updates` +
      ` · ${this.missed} missed · ${this.received.invalid} failed the contract`
    );
  }

  get missedCount(): number {
    return this.missed;
  }

  get invalidCount(): number {
    return this.received.invalid;
  }

  async close(): Promise<void> {
    if (this.channel) await this.client.removeChannel(this.channel);
    this.channel = null;
  }
}
