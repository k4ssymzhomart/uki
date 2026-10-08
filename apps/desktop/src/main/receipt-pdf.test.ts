// @vitest-environment node
import { join } from "node:path";
import { loadMessages } from "@uki/i18n";
import type { SaveDialogOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import {
  RECEIPT_PDF_OPTIONS,
  RECEIPT_PRINT_CSS,
  receiptFileName,
  type SaveReceiptDeps,
  saveReceiptPdf,
  withPdfExtension,
} from "./receipt-pdf.ts";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function setup(options: {
  probe?: unknown;
  dialog?: { canceled: boolean; filePath?: string };
  printFails?: boolean;
}) {
  const order: string[] = [];
  const contents = {
    executeJavaScript: vi.fn(async () => {
      order.push("probe");
      return "probe" in options ? options.probe : { receiptId: "UKI-204-0942-MT", lang: "en-GB" };
    }),
    insertCSS: vi.fn(async (_css: string) => {
      order.push("insertCSS");
      return "css-key-1";
    }),
    removeInsertedCSS: vi.fn(async (_key: string) => {
      order.push("removeInsertedCSS");
    }),
    printToPDF: vi.fn(async () => {
      order.push("printToPDF");
      if (options.printFails) throw new Error("printing failed");
      return Buffer.from(PDF);
    }),
  };
  const showSaveDialog = vi.fn(async (_window: unknown, _options: SaveDialogOptions) => {
    order.push("dialog");
    return { canceled: false, filePath: "/Users/aliya/Documents/UKI-204-0942-MT.pdf", ...options.dialog };
  });
  const writeFile = vi.fn(async (_path: string, _data: Uint8Array) => {
    order.push("write");
  });
  const deps = {
    window: { isDestroyed: () => false, webContents: contents },
    showSaveDialog,
    documentsPath: "/Users/aliya/Documents",
    writeFile,
  } as unknown as SaveReceiptDeps;
  return { deps, contents, showSaveDialog, writeFile, order };
}

describe("saveReceiptPdf", () => {
  it("prints the marked card with the print style, then asks where to save, then writes", async () => {
    const { deps, contents, showSaveDialog, writeFile, order } = setup({});
    await expect(saveReceiptPdf(deps)).resolves.toBe("/Users/aliya/Documents/UKI-204-0942-MT.pdf");
    expect(order).toEqual(["probe", "insertCSS", "printToPDF", "removeInsertedCSS", "dialog", "write"]);
    expect(contents.insertCSS).toHaveBeenCalledWith(RECEIPT_PRINT_CSS);
    expect(contents.removeInsertedCSS).toHaveBeenCalledWith("css-key-1");
    expect(contents.printToPDF).toHaveBeenCalledWith(RECEIPT_PDF_OPTIONS);
    expect(RECEIPT_PDF_OPTIONS.printBackground).toBe(true);
    const dialogOptions = showSaveDialog.mock.calls[0]?.[1];
    expect(dialogOptions?.title).toBe(loadMessages("en").done.save);
    // The OS's own separator: backslashes on Windows.
    expect(dialogOptions?.defaultPath).toBe(join("/Users/aliya/Documents", "UKI-204-0942-MT.pdf"));
    expect(dialogOptions?.filters).toEqual([{ name: "PDF", extensions: ["pdf"] }]);
    expect(writeFile.mock.calls[0]?.[1]).toEqual(Buffer.from(PDF));
  });

  it("returns null when the student cancels, and writes nothing", async () => {
    const { deps, writeFile } = setup({ dialog: { canceled: true } });
    await expect(saveReceiptPdf(deps)).resolves.toBeNull();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("adds .pdf when the chosen name has no extension", async () => {
    const { deps, writeFile } = setup({ dialog: { canceled: false, filePath: "/tmp/my receipt" } });
    await expect(saveReceiptPdf(deps)).resolves.toBe("/tmp/my receipt.pdf");
    expect(writeFile.mock.calls[0]?.[0]).toBe("/tmp/my receipt.pdf");
  });

  it("refuses when no element is marked as the receipt card", async () => {
    const { deps, contents } = setup({ probe: null });
    await expect(saveReceiptPdf(deps)).rejects.toThrow(/data-uki-print/);
    expect(contents.printToPDF).not.toHaveBeenCalled();
  });

  it("treats a malformed answer from the page as no card", async () => {
    const { deps } = setup({ probe: { receiptId: 7, lang: ["kk"] } });
    await expect(saveReceiptPdf(deps)).rejects.toThrow(/data-uki-print/);
  });

  it("removes the print style even when printing fails", async () => {
    const { deps, contents } = setup({ printFails: true });
    await expect(saveReceiptPdf(deps)).rejects.toThrow(/printing failed/);
    expect(contents.removeInsertedCSS).toHaveBeenCalledWith("css-key-1");
  });

  it("titles the dialog in the student's language", async () => {
    const { deps, showSaveDialog } = setup({ probe: { receiptId: null, lang: "kk-KZ" } });
    await saveReceiptPdf(deps);
    const kk = loadMessages("kk");
    expect(showSaveDialog.mock.calls[0]?.[1].title).toBe(kk.done.save);
    expect(showSaveDialog.mock.calls[0]?.[1].defaultPath).toBe(
      join("/Users/aliya/Documents", `${kk.done.receipt}.pdf`),
    );
  });
});

describe("file names", () => {
  it("uses a valid receipt id, else the catalog's word for receipt", () => {
    expect(receiptFileName({ receiptId: "UKI-204-0942-MT", lang: "ru-RU" })).toBe("UKI-204-0942-MT.pdf");
    expect(receiptFileName({ receiptId: "../../etc/passwd", lang: "ru-RU" })).toBe(
      `${loadMessages("ru").done.receipt}.pdf`,
    );
    expect(receiptFileName({ receiptId: null, lang: "en-GB" })).toBe("Receipt.pdf");
  });

  it("adds the extension once", () => {
    expect(withPdfExtension("/a/b.PDF")).toBe("/a/b.PDF");
    expect(withPdfExtension("/a/b")).toBe("/a/b.pdf");
  });
});

describe("print style", () => {
  it("shows only the marked card", () => {
    expect(RECEIPT_PRINT_CSS).toMatch(/^@media print/);
    expect(RECEIPT_PRINT_CSS).toContain("body * { visibility: hidden !important; }");
    expect(RECEIPT_PRINT_CSS).toContain('[data-uki-print="receipt"], [data-uki-print="receipt"] *');
  });
});
