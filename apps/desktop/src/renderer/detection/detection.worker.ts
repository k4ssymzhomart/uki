// The detection worker entry ("Pipeline" in docs/phase-0-plan.md): MediaPipe Face Landmarker, the phone
// detector, the rules engine and the stills, all from @uki/detection. Created as a module worker by
// detection/runtime.ts; electron-vite builds it with worker.format "es".
import "@uki/detection/worker";
