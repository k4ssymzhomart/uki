/// <reference types="electron-vite/node" />

// Build-time variables electron-vite exposes to the main process (envDir is the repository root).
interface ImportMetaEnv {
  /** The Supabase project URL; its host is the only one the renderer's CSP lets it reach. */
  readonly VITE_SUPABASE_URL?: string;
  /** The Üki Lock extension id; the Lock relay accepts only the origin chrome-extension://<this id>. */
  readonly VITE_LOCK_EXTENSION_ID?: string;
}
