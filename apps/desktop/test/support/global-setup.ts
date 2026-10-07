// Before the desktop e2e run: the e2e build is in out/, the detection models are on disk, the local
// stack answers and the four Edge Functions are served. Each check says how to fix what is missing.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readStackEnv } from "../../../../test/integration/stack.ts";
import { DESKTOP_DIR } from "./app.ts";

const FUNCTIONS = ["ingest", "frames", "command", "stills"] as const;
const READY_TIMEOUT_MS = 120_000;

async function probe(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(30_000),
    });
    await response.body?.cancel();
    return response.status;
  } catch {
    return null;
  }
}

export default async function globalSetup(): Promise<void> {
  const assets = join(DESKTOP_DIR, "out", "renderer", "assets");
  if (!existsSync(assets) || !readdirSync(assets).some((file) => file.startsWith("synthetic-camera"))) {
    throw new Error(
      "desktop e2e: out/ is not an e2e build. Run `pnpm --filter desktop e2e` (it builds with --mode e2e).",
    );
  }
  const manifest = join(DESKTOP_DIR, "resources", "models", "manifest.json");
  const landmarker = join(DESKTOP_DIR, "resources", "models", "face_landmarker.task");
  if (!existsSync(manifest) || !existsSync(landmarker)) {
    throw new Error("desktop e2e: no detection models. Run `pnpm models` (then `pnpm models:verify`).");
  }
  JSON.parse(readFileSync(manifest, "utf8"));

  const stack = readStackEnv();
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (const name of FUNCTIONS) {
    const url = `${stack.apiUrl}/functions/v1/${name}`;
    let status = await probe(url);
    while (status !== 401 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      status = await probe(url);
    }
    if (status !== 401) {
      throw new Error(
        `desktop e2e: functions/v1/${name} answered ${status ?? "nothing"}, expected 401. ` +
          "Start the stack (`supabase start`) and the functions (`pnpm functions:serve`).",
      );
    }
  }
}
