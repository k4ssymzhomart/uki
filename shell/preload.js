// Minimal, safe bridge. The renderer talks to the engine over WebSocket
// directly; this is here for future privileged calls.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("uki", {
  version: "0.1.0",
});
