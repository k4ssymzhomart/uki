/// <reference types="vite/client" />
import type { UkiBridge } from "@uki/contracts/ipc";

declare global {
  interface Window {
    /** The preload's bridge to the main process (src/preload/index.ts). */
    readonly uki: UkiBridge;
  }

  // Build-time variables (envDir is the repository root). Apps carry only the publishable key.
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
    /** The Üki Lock extension id; the app's socket accepts only chrome-extension://<this id>. */
    readonly VITE_LOCK_EXTENSION_ID?: string;
    /** Optional: the exam office's address for 2.1d (ended.contact); the line is left out when unset. */
    readonly VITE_EXAM_OFFICE_EMAIL?: string;
  }
}
