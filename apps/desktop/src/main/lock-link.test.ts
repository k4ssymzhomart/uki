// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppToLock, LockStatus } from "@uki/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startLockLink } from "./lock-link.ts";
import { ANY_EXTENSION_ORIGIN, type LockRelayOptions } from "./lock-relay.ts";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup(options: { extensionId?: string; dev?: boolean; status?: LockStatus } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "uki-lock-link-"));
  dirs.push(dir);
  let relayOptions: LockRelayOptions | undefined;
  const relay = {
    status: vi.fn(() => options.status ?? "connected"),
    send: vi.fn((_message: AppToLock) => true),
    close: vi.fn(async () => {}),
  };
  const link = startLockLink({
    extensionId: options.extensionId,
    dev: options.dev ?? false,
    appVersion: "0.1.0",
    os: "macos",
    pairingFile: join(dir, "lock-pairing.json"),
    onMessage: vi.fn(),
    onStatus: vi.fn(),
    onPairCode: vi.fn(),
    log: { info: () => {}, warn: () => {}, error: () => {} },
    createRelay: (o) => {
      relayOptions = o;
      return relay;
    },
  });
  if (!relayOptions) throw new Error("relay not created");
  const created = relayOptions;
  const appInfo = () => (typeof created.appInfo === "function" ? created.appInfo() : created.appInfo);
  return { link, relay, relayOptions, appInfo };
}

describe("startLockLink", () => {
  it("accepts only the Üki Lock origin", async () => {
    const id = "abcdefghijklmnopabcdefghijklmnop";
    expect((await setup({ extensionId: id })).relayOptions.allowedOrigin).toBe(`chrome-extension://${id}`);
    expect((await setup({ extensionId: undefined, dev: false })).relayOptions.allowedOrigin).toBe("");
    expect((await setup({ extensionId: undefined, dev: true })).relayOptions.allowedOrigin).toBe(
      ANY_EXTENSION_ORIGIN,
    );
  });

  it("keeps the student's name from the renderer's hello and fills in the app's own facts", async () => {
    const { link, relay, appInfo } = await setup({ status: "paired" });
    expect(appInfo()).toEqual({ app_version: "0.1.0", os: "macos", student_name: null });
    link.send({
      type: "hello",
      app_version: "9.9.9",
      os: "windows",
      paired: false,
      student_name: "Aliya S.",
    });
    expect(relay.send).toHaveBeenCalledWith({
      type: "hello",
      app_version: "0.1.0",
      os: "macos",
      paired: true,
      student_name: "Aliya S.",
    });
    expect(appInfo().student_name).toBe("Aliya S.");
  });

  it("passes every other message, the status and close through", async () => {
    const { link, relay } = await setup({ status: "connected" });
    link.send({ type: "lock.release", reason: "submitted" });
    expect(relay.send).toHaveBeenCalledWith({ type: "lock.release", reason: "submitted" });
    expect(link.status()).toBe("connected");
    await link.close();
    expect(relay.close).toHaveBeenCalledOnce();
  });
});
