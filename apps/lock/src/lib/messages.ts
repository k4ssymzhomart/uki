// Messages inside the extension: the popup and the content script ask the service worker over
// chrome.runtime.sendMessage. The service worker parses each with Zod and answers with a RuntimeReply.
// Nothing here leaves the browser; only the service worker talks to the app.
import { CopyKind } from "@uki/contracts";
import { z } from "zod";

export const RuntimeRequest = z.discriminatedUnion("type", [
  /** E.3: ask the app for a pairing code. */
  z.object({ type: z.literal("popup.pair") }),
  /** E.3: Pair, confirming the code both sides show. */
  z.object({ type: z.literal("popup.confirm") }),
  /** E.4: Lock and start, from the tab the popup was opened on. */
  z.object({ type: z.literal("popup.lock"), tab_id: z.number().int().nonnegative().optional() }),
  /** E.9: Close. */
  z.object({ type: z.literal("popup.dismiss") }),
  /** The content script cancelled a copy, cut, paste or print. */
  z.object({ type: z.literal("content.blocked"), kind: CopyKind }),
]);
export type RuntimeRequest = z.infer<typeof RuntimeRequest>;

export const RuntimeReply = z.object({
  ok: z.boolean(),
  /** content.blocked: whether this attempt went to the exam log (one per kind every 10 s). */
  noted: z.boolean().optional(),
});
export type RuntimeReply = z.infer<typeof RuntimeReply>;
