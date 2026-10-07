// receipt.savePdf() on 3.1 and 2.1d: printToPDF of the receipt card, then a save dialog. The renderer
// marks the card with data-uki-print="receipt" (and may add data-uki-receipt-id="UKI-..."); the print
// style below, inserted only for the print, hides everything else.
import { writeFile as fsWriteFile } from "node:fs/promises";
import { join } from "node:path";
import { RECEIPT_ID_PATTERN } from "@uki/contracts";
import { createUkiTranslator } from "@uki/i18n";
import type { BrowserWindow, Dialog, PrintToPDFOptions, SaveDialogOptions, WebContents } from "electron";
import { z } from "zod";
import { localeFromTag } from "./locale.ts";

/** The attribute the renderer puts on the receipt card. */
export const RECEIPT_PRINT_ATTRIBUTE = "data-uki-print";
export const RECEIPT_PRINT_VALUE = "receipt";
/** Optional, on the same element: the receipt id, used as the file name. */
export const RECEIPT_ID_ATTRIBUTE = "data-uki-receipt-id";

const CARD = `[${RECEIPT_PRINT_ATTRIBUTE}="${RECEIPT_PRINT_VALUE}"]`;

/** Print only: the card alone, at the top of the page, centred, with its own backgrounds. */
export const RECEIPT_PRINT_CSS = `@media print {
  html, body { background: none !important; }
  body * { visibility: hidden !important; }
  ${CARD}, ${CARD} * { visibility: visible !important; }
  ${CARD} { position: fixed !important; top: 0 !important; left: 50% !important; transform: translateX(-50%) !important; margin: 0 !important; }
}`;

export const RECEIPT_PDF_OPTIONS: PrintToPDFOptions = {
  printBackground: true,
  pageSize: "A4",
  pageRanges: "1",
};

/** A file format name, the same in every language. */
const PDF_FILTER = { name: "PDF", extensions: ["pdf"] };

/** What the page tells the main process about the card, checked before use. */
const ReceiptProbe = z.object({ receiptId: z.string().nullable(), lang: z.string() }).nullable().catch(null);
type ReceiptProbe = z.infer<typeof ReceiptProbe>;

const PROBE_SCRIPT = `(() => {
  const card = document.querySelector('${CARD}');
  return card ? { receiptId: card.getAttribute('${RECEIPT_ID_ATTRIBUTE}'), lang: document.documentElement.lang } : null;
})()`;

/** "UKI-204-0942-MT.pdf" when the card carries a valid receipt id, otherwise the catalog's "Receipt.pdf". */
export function receiptFileName(probe: NonNullable<ReceiptProbe>): string {
  const id = probe.receiptId?.trim() ?? "";
  if (RECEIPT_ID_PATTERN.test(id)) return `${id}.pdf`;
  return `${createUkiTranslator(localeFromTag(probe.lang))("done.receipt")}.pdf`;
}

export function withPdfExtension(path: string): string {
  return path.toLowerCase().endsWith(".pdf") ? path : `${path}.pdf`;
}

export type ReceiptContents = Pick<
  WebContents,
  "executeJavaScript" | "insertCSS" | "removeInsertedCSS" | "printToPDF"
>;

export type SaveReceiptDeps = {
  window: Pick<BrowserWindow, "isDestroyed"> & { readonly webContents: ReceiptContents };
  showSaveDialog: (window: BrowserWindow, options: SaveDialogOptions) => ReturnType<Dialog["showSaveDialog"]>;
  /** Where the dialog opens: the Documents folder. */
  documentsPath: string;
  writeFile?: (path: string, data: Uint8Array) => Promise<void>;
};

/** Prints the marked card to a PDF and asks where to save it. Returns the saved path, or null if cancelled. */
export async function saveReceiptPdf(deps: SaveReceiptDeps): Promise<string | null> {
  const { window } = deps;
  if (window.isDestroyed()) return null;
  const contents = window.webContents;

  const probe = ReceiptProbe.parse(await contents.executeJavaScript(PROBE_SCRIPT));
  if (probe === null) throw new Error(`receipt.savePdf: no element carries ${CARD}`);

  const cssKey = await contents.insertCSS(RECEIPT_PRINT_CSS);
  let pdf: Uint8Array;
  try {
    pdf = await contents.printToPDF(RECEIPT_PDF_OPTIONS);
  } finally {
    await contents.removeInsertedCSS(cssKey);
  }

  const t = createUkiTranslator(localeFromTag(probe.lang));
  const result = await deps.showSaveDialog(window as BrowserWindow, {
    title: t("done.save"),
    defaultPath: join(deps.documentsPath, receiptFileName(probe)),
    filters: [PDF_FILTER],
    properties: ["createDirectory", "showOverwriteConfirmation"],
  });
  if (result.canceled || !result.filePath) return null;

  const path = withPdfExtension(result.filePath);
  await (deps.writeFile ?? fsWriteFile)(path, pdf);
  return path;
}
