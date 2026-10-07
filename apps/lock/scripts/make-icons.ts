// Draws Üki Lock's toolbar icons (Figma Ext/Toolbar icon 89:2491: Off, Ready, Locked) and the extension
// icon (the neutral face) as PNGs from the Figma exports in .figma-cache/89-2491, rasterised by Chromium.
// The Locked badge hangs 2 px past the 32 px frame in Figma, so every state is drawn in a 34 px box.
//
//   pnpm exec tsx apps/lock/scripts/make-icons.ts   (from the repository root; writes apps/lock/public)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { colour } from "@uki/tokens";
import { chromiumExecutable } from "./chromium.ts";

const LOCK_DIR = fileURLToPath(new URL("..", import.meta.url));
const FIGMA = join(LOCK_DIR, "../../.figma-cache/89-2491");
const PUBLIC = join(LOCK_DIR, "public");
const SIZES = [16, 32, 48, 128] as const;
const CHROMIUM = chromiumExecutable();

function asset(name: string): string {
  return readFileSync(join(FIGMA, name), "utf8").replace(/ style="display: block;"/, "");
}

/** A Figma export placed at (x, y) inside the icon. */
function place(svg: string, x: number, y: number): string {
  return svg.replace("<svg ", `<svg x="${x}" y="${y}" `);
}

const faceOff = asset("asset-9c533.svg");
const ready = asset("asset-a807f.svg");
const face = asset("asset-922b2.svg");
const lock = asset("asset-244f9.svg");

const BOX = 34;
const states: Record<string, string> = {
  off: place(faceOff, 5, 5),
  ready: place(ready, 0, 0),
  // Badge: 16 px at (18, 18), bg-inverse with a 2 px bg-surface ring, the lock icon 11 px centred.
  locked: [
    place(face, 5, 5),
    `<rect x="19" y="19" width="14" height="14" rx="7" fill="${colour("bg-inverse")}" stroke="${colour("bg-surface")}" stroke-width="2"/>`,
    place(lock, 20.5, 20.5),
  ].join(""),
  face: place(face, 0, 0),
};

function svgFor(name: string): string {
  const box = name === "face" ? 22 : BOX;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}">${states[name]}</svg>`;
}

async function main(): Promise<void> {
  mkdirSync(join(PUBLIC, "icons"), { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    for (const name of Object.keys(states)) {
      for (const size of SIZES) {
        const page = await browser.newPage({ viewport: { width: size, height: size } });
        const data = Buffer.from(svgFor(name)).toString("base64");
        await page.setContent(
          `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${data}" width="${size}" height="${size}" style="display:block"></body></html>`,
        );
        await page.locator("img").evaluate((img: HTMLImageElement) => img.decode());
        const png = await page.screenshot({
          omitBackground: true,
          clip: { x: 0, y: 0, width: size, height: size },
        });
        const file =
          name === "face" ? join(PUBLIC, `icon-${size}.png`) : join(PUBLIC, "icons", `${name}-${size}.png`);
        writeFileSync(file, png);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(`icons written to ${PUBLIC}\n`);
}

void main();
