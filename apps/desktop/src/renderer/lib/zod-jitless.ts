// Zod 4 builds fast object parsers with `new Function`, and finds out whether it may by calling
// `new Function("")` when the first z.object() is created. The renderer's CSP has no 'unsafe-eval', so
// that probe is reported as a script-src 'eval' violation even though Zod catches the error. jitless
// skips the probe and the compiled parsers. Zod reads the setting when a schema is created, so this is
// the first import of every renderer and worker entry (main.tsx, detection/detection.worker.ts), ahead
// of anything that creates a schema. The preload's isolated world allows eval and the main process has
// no CSP, so neither needs it.
import { z } from "zod";

z.config({ jitless: true });
