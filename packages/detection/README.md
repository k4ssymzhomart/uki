# @uki/detection

On-device detection for the Üki desktop app (work package 0.5): the camera pump, the detection worker (MediaPipe Face Landmarker and Object Detector), the rules engine, flagged stills, the fps fallback, the developer overlay data and the card match on 1.3 (Human and Tesseract.js). Only events and up to 3 stills per flag leave the laptop.

## Entry points

| Import | Runs in | Holds |
| --- | --- | --- |
| `@uki/detection` | renderer | `openCamera`, `createDetectionClient`, `toEnvelope`, `modelUrls`, the rules engine and every type and Zod schema |
| `@uki/detection/worker` | module worker | the worker entry; import it from a one-line worker file |
| `@uki/detection/identity` | renderer, on 1.3 only | `createIdentityCheck`, `decide`; import it lazily, it pulls in Human and Tesseract.js |

`stills.ts` and `pipeline.ts` are not exported: image bytes are made only in the worker, and `test/privacy.test.ts` enforces it.

## Wiring it into the desktop renderer

```ts
// apps/desktop/src/renderer/detection.worker.ts
import "@uki/detection/worker";

// renderer
import { createDetectionClient, modelUrls, openCamera, toEnvelope } from "@uki/detection";

const urls = modelUrls(); // uki://app/resources/models/...
const worker = new Worker(new URL("./detection.worker.ts", import.meta.url), { type: "module" });
const detection = createDetectionClient(worker, {
  onEvent: (event) => outbox.addEvent(toEnvelope(event, { session_id, seq: nextSeq(), app_version })),
  onStill: (still) => outbox.addStill(still), // stillPath(examId, sessionId, still.eventId, still.index)
  onCue: (cue) => flow.send(cue),             // phone: 2.2 or the Lock's "Phone found"; paused: 2.3; away: Watching panel
  onState: (state) => flow.send({ type: "detection.state", state }), // state.canResume enables "I'm here"
  onCameraCheck: (check) => systemCheck.camera(check),              // the 1.2 camera row
  onDebug: (debug) => overlay.set(debug),     // Ctrl+Shift+D in development builds
});
await detection.init({
  checks: exam.checks,
  mode: exam.mode,
  models: { wasmBase: urls.wasmBase, faceLandmarker: urls.faceLandmarker, objectDetector: urls.objectDetector },
  debug: import.meta.env.DEV,
});
const camera = await openCamera();           // preview: <video muted autoplay srcObject={camera.stream}>
detection.attach(camera);
detection.setPhase("check");                 // 1.2 and 1.3: face tracking and the camera row
detection.setPhase("exam");                  // 2.1: phone checks, rules and stills
await detection.resume();                    // "I'm here" on 2.3; true when session.resumed was sent
detection.setPhase("idle");                  // after submit; closes an open look first
detection.dispose();
```

electron-vite's renderer config needs `worker: { format: "es" }`. The worker uses a native dynamic `import()` for the wasm loader, which Vite and Rollup leave alone.

## MediaPipe in a module worker

tasks-vision 1.1 loads its Emscripten loader with `importScripts`, which throws a TypeError in module workers; tasks-vision then calls `self.import(url)` if it exists, or a native `import(url)`. `src/vision.ts` makes this work:

1. `FilesetResolver.forVisionTasks(base, true)` selects `vision_wasm_module_internal.js`, the ES-module build. It sets `globalThis.ModuleFactory` and exports it as default.
2. tasks-vision clears `self.ModuleFactory` after creating each task, and a second `import()` of the same URL returns the cached module without running it. So the Object Detector, the second task, would fail with "ModuleFactory not set.". `installModuleImport` defines `self.import`, which restores the factory from the module's default export on every load.

Checked in Chrome 152 in development and production (Rollup) builds: both tasks load in one module worker, with the Face Landmarker on the GPU delegate. Frames from `MediaStreamTrackProcessor` keep flowing in a hidden page.

## Rules

`createRules(checks, { mode, newId })` is a pure state machine with no clock; the header of `src/rules.ts` lists every rule. The numbers come from `exams.checks` (`ExamChecks`) and `THRESHOLDS` in `@uki/contracts`. An event's `at` is the moment its threshold was crossed, which is also when its first still is taken. gaze.off_screen and gaze.down are sent when the look ends, with the full duration.

## Tests and fixtures

`pnpm --filter @uki/detection test` replays the recorded traces in `test/fixtures/*.json`: look away 3 s, phone lifted, leave the seat 10 s, a second person, camera unplugged, and 5 minutes of normal writing. They are built by the seeded builder in `test/support/trace.ts`. After changing the builder, regenerate them with `pnpm exec tsx test/fixtures/generate.ts`; `fixtures.test.ts` fails when they are stale.

Models: `pnpm --filter @uki/detection models` and `models:verify`, see `apps/desktop/resources/models/README.md`.
