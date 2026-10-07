// A stand-in for Üki Lock's service worker on the app's local socket (127.0.0.1:47801-47803): it says
// hello, asks to pair and confirms the code, exactly as apps/lock does, so the run sees the relay, the
// main process, window.uki.lock.onPairCode and the pairing card work together. The real extension's
// pairing is covered by `pnpm --filter lock smoke`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type AppToLock, LOCK_HOST, LOCK_PORTS, parseAppToLock, uuidv7 } from "@uki/contracts";
import WebSocket from "ws";

const ROOT_ENV = fileURLToPath(new URL("../../../../.env", import.meta.url));

/** The origin the app accepts: the build's VITE_LOCK_EXTENSION_ID, or any extension in a development build. */
function lockOrigin(): string {
  let id = process.env.VITE_LOCK_EXTENSION_ID ?? "";
  if (!id) {
    try {
      id = /^VITE_LOCK_EXTENSION_ID=(.*)$/m.exec(readFileSync(ROOT_ENV, "utf8"))?.[1]?.trim() ?? "";
    } catch {
      id = "";
    }
  }
  return `chrome-extension://${id || "abcdefghijklmnopabcdefghijklmnop"}`;
}

export interface FakeLock {
  /** Every message the app sent, oldest first. */
  received: AppToLock[];
  /** Resolves with the first message of `type` (already received or still to come). */
  next<T extends AppToLock["type"]>(type: T, timeoutMs?: number): Promise<Extract<AppToLock, { type: T }>>;
  send(message: Record<string, unknown>): void;
  close(): void;
}

async function connect(port: number, origin: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://${LOCK_HOST}:${port}`, { origin });
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
    socket.once("unexpected-response", (_request, response) =>
      reject(new Error(`port ${port}: HTTP ${response.statusCode}`)),
    );
  });
}

/** Connects to the app's relay on the first port that takes it, and says hello. */
export async function connectFakeLock(): Promise<FakeLock> {
  const origin = lockOrigin();
  let socket: WebSocket | null = null;
  const errors: string[] = [];
  for (const port of LOCK_PORTS) {
    try {
      socket = await connect(port, origin);
      break;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!socket) throw new Error(`fake Lock: no relay answered (${errors.join("; ")})`);
  const open = socket;
  const received: AppToLock[] = [];
  const waiters: Array<() => void> = [];
  open.on("message", (data) => {
    const parsed = parseAppToLock(String(data));
    if (!parsed.ok) throw new Error(`fake Lock: the app sent a frame outside the contract: ${parsed.error}`);
    const message = parsed.message;
    if (message.type === "ping") open.send(JSON.stringify({ type: "pong", at: Date.now() }));
    received.push(message);
    for (const wake of waiters.splice(0)) wake();
  });
  const send = (message: Record<string, unknown>) => open.send(JSON.stringify(message));
  send({ type: "hello", lock_version: "0.0.0", browser: "chrome", install_id: uuidv7() });
  return {
    received,
    send,
    close: () => open.close(),
    async next(type, timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const found = received.find((message) => message.type === type);
        if (found) return found as Extract<AppToLock, { type: typeof type }>;
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`fake Lock: no ${type} within ${timeoutMs} ms`);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, left);
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
  };
}
