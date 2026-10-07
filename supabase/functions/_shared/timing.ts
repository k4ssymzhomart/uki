// Server-Timing for the Edge Functions: how long each phase of one request took (auth, body, the
// handler's database and Storage calls, the reply), so a load run can tell the function's own time
// from the network and the edge runtime's queue. A fresh isolate also reports `boot`: the time from
// the isolate's start to the function being ready. Durations only, never data. Pure, so Vitest runs it
// under Node.

/** A Server-Timing metric name: a token, so the header always parses. */
const NAME = /^[a-z][a-z0-9_-]*$/;

export class ServerTiming {
  private readonly entries: [string, number][] = [];

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Adds `ms` to the metric `name` (repeated names add up, e.g. two Storage calls). */
  add(name: string, ms: number): void {
    if (!NAME.test(name) || !Number.isFinite(ms)) return;
    const entry = this.entries.find(([key]) => key === name);
    if (entry) entry[1] += Math.max(0, ms);
    else this.entries.push([name, Math.max(0, ms)]);
  }

  /** Runs `op` and adds its duration to `name`, whether it resolves or throws. */
  async measure<T>(name: string, op: () => PromiseLike<T>): Promise<T> {
    const started = this.now();
    try {
      return await op();
    } finally {
      this.add(name, this.now() - started);
    }
  }

  /** `auth;dur=1.2, rpc;dur=8.4`, in the order the metrics were first added. */
  header(): string {
    return this.entries.map(([name, ms]) => `${name};dur=${Math.round(ms * 10) / 10}`).join(", ");
  }
}
