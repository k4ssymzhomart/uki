// Loading MediaPipe tasks-vision 1.1 inside a module worker (the detection worker is created with
// `{ type: "module" }`).
//
// tasks-vision loads its Emscripten loader with `importScripts(url)`. A module worker has
// `importScripts` but it throws a TypeError, and tasks-vision then falls back to `self.import(url)` if
// that function exists, else to a native `import(url)`. Two things make that work:
// 1. `FilesetResolver.forVisionTasks(base, true)` picks vision_wasm_module_internal.js, the ES-module
//    build, which sets `globalThis.ModuleFactory` and also exports it as default. The classic
//    vision_wasm_internal.js would run as a module and leave ModuleFactory unset.
// 2. After creating each task, tasks-vision sets `self.ModuleFactory` back to undefined, and a second
//    `import()` of the same URL returns the cached module without running it again. So creating the
//    Object Detector after the Face Landmarker fails with "ModuleFactory not set." unless something
//    restores it. `installModuleImport` defines `self.import`, which imports the loader and puts its
//    default export back on `self.ModuleFactory` every time.
// The loader and the wasm come from the app's own resources (uki://app/resources/models/wasm), never a
// CDN; the protocol handler must serve .js as text/javascript and .wasm as application/wasm.
import { FilesetResolver } from "@mediapipe/tasks-vision";

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

interface ModuleLoaderScope {
  import?: (url: string) => Promise<void>;
  ModuleFactory?: unknown;
}

/** Defines `self.import` so tasks-vision can load its ES-module wasm loader any number of times. */
export function installModuleImport(
  scope: ModuleLoaderScope = globalThis as unknown as ModuleLoaderScope,
  load: (url: string) => Promise<{ default?: unknown }> = (url) => import(/* @vite-ignore */ url),
): void {
  scope.import = async (url: string) => {
    const module = await load(url);
    if (typeof module.default !== "function") throw new Error(`${url} has no default ModuleFactory export`);
    scope.ModuleFactory = module.default;
  };
}

const filesets = new Map<string, Promise<WasmFileset>>();

/** The tasks-vision fileset for the ES-module wasm build under `wasmBase` (no trailing slash). */
export function visionFileset(wasmBase: string): Promise<WasmFileset> {
  const base = wasmBase.replace(/\/+$/, "");
  let fileset = filesets.get(base);
  if (!fileset) {
    installModuleImport();
    fileset = FilesetResolver.forVisionTasks(base, true);
    fileset.catch(() => filesets.delete(base));
    filesets.set(base, fileset);
  }
  return fileset;
}

/** Strictly increasing timestamps per task, as `detectForVideo` requires. */
export function monotonic(): (at: number) => number {
  let last = Number.NEGATIVE_INFINITY;
  return (at) => {
    const ts = at > last ? at : last + 1;
    last = ts;
    return ts;
  };
}
