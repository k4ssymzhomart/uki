// @uki/detection for the desktop renderer. The worker entry is "@uki/detection/worker" and the card
// match is "@uki/detection/identity" (load it lazily on 1.3). stills.ts is deliberately not exported:
// only the worker's pipeline may make image bytes.
export * from "./camera.ts";
export * from "./client.ts";
export * from "./debug.ts";
export * from "./envelope.ts";
export * from "./models.ts";
export * from "./perf.ts";
export * from "./protocol.ts";
export * from "./rules.ts";
export * from "./signals.ts";
export * from "./still-schedule.ts";
