// The /try demo's detection worker: the desktop app's worker entry from @uki/detection, unchanged
// (MediaPipe Face Landmarker and Object Detector, the rules engine). try-runtime.ts starts it as a module
// worker; it loads the models and wasm from this site's /models/, never from a CDN.
import "@uki/detection/worker";
