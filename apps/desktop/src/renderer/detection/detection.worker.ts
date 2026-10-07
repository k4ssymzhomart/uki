// The detection worker entry ("Pipeline" in docs/phase-0-plan.md): MediaPipe Face Landmarker, the phone
// detector, the rules engine and the stills, all from @uki/detection. Created as a module worker by
// detection/runtime.ts; electron-vite builds it with worker.format "es". The worker gets the CSP too, so
// Zod goes jitless first (lib/zod-jitless.ts).
import "../lib/zod-jitless.ts";
import "@uki/detection/worker";
