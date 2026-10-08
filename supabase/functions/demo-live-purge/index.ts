// POST /functions/v1/demo-live-purge: deletes the stills of DEMO-LIVE sessions that no longer exist
// (judge mode, docs/runbooks/judge-mode.md). demo_live_tick calls it through pg_net with the secret key
// from Vault after each rollover, and once an hour while stills are left over, so `auth: "secret"`.
//
// demo_live_orphans lists objects under DEMO-LIVE's prefix in the frames bucket whose session is gone;
// they are removed through the Storage API, which deletes the files themselves (a delete from
// storage.objects in SQL would leave them behind). A still of a session that still exists is never
// listed, and only exact still paths are removed (purge.ts). Safe to repeat.
import { DemoLivePurgeInput, DemoLivePurgeOutput, FRAMES_BUCKET } from "../_shared/contracts/index.ts";
import { ApiFailure, fromDatabaseError } from "../_shared/errors.ts";
import { serveApi } from "../_shared/http.ts";
import { retryOnGateway } from "../_shared/retry.ts";
import { parseRow } from "../_shared/rows.ts";
import { batches, OrphanRows, stillsToRemove } from "./purge.ts";

Deno.serve(
  serveApi({
    name: "demo-live-purge",
    auth: "secret",
    input: DemoLivePurgeInput,
    output: DemoLivePurgeOutput,
    async handle(input, ctx) {
      const listed = await retryOnGateway(() =>
        ctx.supabaseAdmin.rpc("demo_live_orphans", { p_limit: input.limit ?? 1000 }),
      );
      if (listed.error) throw fromDatabaseError(listed.error, "demo_live_orphans");
      const paths = stillsToRemove(parseRow(OrphanRows, listed.data ?? [], "demo_live_orphans"));

      let removed = 0;
      for (const batch of batches(paths)) {
        const result = await retryOnGateway(() =>
          ctx.supabaseAdmin.storage.from(FRAMES_BUCKET).remove(batch),
        );
        if (result.error) throw new ApiFailure("internal", `storage remove: ${result.error.message}`);
        removed += result.data?.length ?? 0;
      }
      if (paths.length > 0) console.log(`[demo-live-purge] removed ${removed} of ${paths.length} stills`);
      return { listed: paths.length, removed };
    },
  }),
);
