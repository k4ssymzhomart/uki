// The card match on 1.3 ("Identity check on 1.3" in docs/phase-0-plan.md). Runs in the renderer, not the
// worker. Human (@vladmandic/human) with only blazeface and faceres turns the live face and the photo
// on the student card into descriptors; `human.match.similarity` of 0.5 or more is a match. Tesseract.js
// reads the card's digits with a digits-only whitelist; they must equal the student number used to join.
// Exactly one live face must be outside the card frame for the whole try. After 3 failed tries the app
// shows 1.3a and sends student.help_requested (identity); the check keeps retrying there.
//
// Nothing is stored or sent: descriptors, crops and OCR text stay in local variables of `sample`, and
// the only output for the server is identity.matched { score, tries }. Human and Tesseract.js are loaded
// with dynamic imports when 1.3 opens and are disposed after the match, so they cost nothing during the
// exam. Every file comes from the app's resources (no CDN): Human's modelBasePath, Tesseract's
// workerPath, corePath and langPath. Human uses the WebGL backend, which needs no extra files; its wasm
// backend would need tfjs-backend-wasm binaries that are not installed.
import { type EventData, THRESHOLDS } from "@uki/contracts";
import type { Config, Human } from "@vladmandic/human";
import type Tesseract from "tesseract.js";

/** The lime card frame on 1.3, normalized to the camera frame (0 to 1). */
export interface CardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What one camera frame showed. No pixels, no descriptors. */
export interface IdentityObservation {
  /** Faces whose centre is outside the card frame. */
  liveFaces: number;
  /** A face was found on the card. */
  cardFace: boolean;
  /** human.match.similarity of the live face and the card photo; null when either is missing. */
  similarity: number | null;
  /** Digit runs read from the card; null when OCR did not run on this frame. */
  digits: string[] | null;
}

export type IdentityRow = "ok" | "fail" | "pending";

/** The three rows on 1.3: face (identity.face.*), card (identity.card.*), person (identity.person.*). */
export interface IdentityRows {
  face: IdentityRow;
  card: IdentityRow;
  person: IdentityRow;
}

export type IdentityFailReason =
  | "no_frames"
  | "no_live_face"
  | "more_people"
  | "no_card_face"
  | "face_mismatch"
  | "number_unreadable"
  | "number_mismatch";

export type IdentityVerdict =
  | {
      kind: "matched";
      score: number;
      tries: number;
      rows: IdentityRows;
      event: { type: "identity.matched"; data: EventData<"identity.matched"> };
    }
  | { kind: "retry"; tries: number; rows: IdentityRows; reasons: IdentityFailReason[] }
  | {
      kind: "help";
      tries: number;
      rows: IdentityRows;
      reasons: IdentityFailReason[];
      /** Sent once, on the try that reaches maxTries; later tries on 1.3a send nothing. */
      event: { type: "student.help_requested"; data: EventData<"student.help_requested"> } | null;
    };

/**
 * Digit runs in OCR text. Digits separated by single spaces, hyphens or dots are also joined, because a
 * card may print 2023 1187 for 20231187.
 */
export function digitRuns(text: string): string[] {
  const runs = new Set<string>();
  for (const match of text.matchAll(/\d(?:\d|[ .-](?=\d))*/g)) {
    const group = match[0];
    runs.add(group.replace(/\D/g, ""));
    for (const part of group.split(/\D+/)) if (part) runs.add(part);
  }
  return [...runs];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The verdict for one try from its observations. `tries` is this try's number, from 1. Pure: the
 * thresholds are THRESHOLDS.identity (similarity 0.5, 3 tries).
 */
export function decide(input: {
  observations: readonly IdentityObservation[];
  studentNumber: string;
  tries: number;
}): IdentityVerdict {
  const { observations, studentNumber } = input;
  const tries = Math.max(1, Math.floor(input.tries));
  const { minSimilarity, maxTries } = THRESHOLDS.identity;
  const reasons: IdentityFailReason[] = [];

  let rows: IdentityRows;
  let best: number | null = null;
  if (observations.length === 0) {
    reasons.push("no_frames");
    rows = { face: "pending", card: "pending", person: "pending" };
  } else {
    const onePerson = observations.every((o) => o.liveFaces === 1);
    if (!onePerson) {
      reasons.push(observations.some((o) => o.liveFaces > 1) ? "more_people" : "no_live_face");
    }
    for (const o of observations) {
      if (o.similarity !== null && (best === null || o.similarity > best)) best = o.similarity;
    }
    const faceOk = best !== null && best >= minSimilarity;
    if (!faceOk) {
      if (!observations.some((o) => o.cardFace)) reasons.push("no_card_face");
      else if (!observations.some((o) => o.liveFaces >= 1)) {
        if (!reasons.includes("no_live_face")) reasons.push("no_live_face");
      } else reasons.push("face_mismatch");
    }
    const read = observations.filter((o) => o.digits !== null);
    const numberOk = read.some((o) => o.digits?.includes(studentNumber) ?? false);
    if (!numberOk) {
      reasons.push(read.some((o) => (o.digits?.length ?? 0) > 0) ? "number_mismatch" : "number_unreadable");
    }
    rows = {
      face: faceOk ? "ok" : "fail",
      card: numberOk ? "ok" : read.length === 0 ? "pending" : "fail",
      person: onePerson ? "ok" : "fail",
    };
  }

  if (reasons.length === 0 && best !== null) {
    const score = round3(Math.min(1, Math.max(0, best)));
    return {
      kind: "matched",
      score,
      tries,
      rows,
      event: { type: "identity.matched", data: { score, tries } },
    };
  }
  if (tries < maxTries) return { kind: "retry", tries, rows, reasons };
  return {
    kind: "help",
    tries,
    rows,
    reasons,
    event: tries === maxTries ? { type: "student.help_requested", data: { topic: "identity" } } : null,
  };
}

// ---------------------------------------------------------------------------------------------------
// Human and Tesseract.js (browser only)
// ---------------------------------------------------------------------------------------------------

export interface IdentityCheckOptions {
  /** Human's modelBasePath with a trailing slash, e.g. uki://app/resources/models/human/. */
  humanBase: string;
  tesseract: { workerPath: string; corePath: string; langPath: string };
  /** Default webgl. */
  backend?: "webgl" | "humangl" | "cpu";
}

export type IdentitySource = HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

export interface IdentityCheck {
  /** Loads Human (blazeface, faceres) and a Tesseract worker. */
  load(): Promise<void>;
  /** Looks at one frame. `ocr: true` also reads the card's digits (slower; once per try is enough). */
  sample(source: IdentitySource, card: CardRect, options?: { ocr?: boolean }): Promise<IdentityObservation>;
  /** Frees Human's models and terminates the Tesseract worker. */
  dispose(): Promise<void>;
}

/** The Human config: face detector and description only, local models, no cache, no warm-up. */
export function humanConfig(options: IdentityCheckOptions): Partial<Config> {
  return {
    backend: options.backend ?? "webgl",
    modelBasePath: options.humanBase,
    cacheModels: false,
    debug: false,
    warmup: "none",
    async: true,
    face: {
      enabled: true,
      detector: {
        modelPath: "blazeface.json",
        rotation: false,
        maxDetected: 4,
        minConfidence: 0.3,
        return: false,
      },
      mesh: { enabled: false },
      iris: { enabled: false },
      attention: { enabled: false },
      emotion: { enabled: false },
      antispoof: { enabled: false },
      liveness: { enabled: false },
      gear: { enabled: false },
      description: { enabled: true, modelPath: "faceres.json" },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
    segmentation: { enabled: false },
  };
}

/** The card crop is scaled up so the small card photo and digits reach the detectors' input size. */
const CARD_CROP_MIN_WIDTH = 800;

function sourceSize(source: IdentitySource): { width: number; height: number } {
  if ("videoWidth" in source) return { width: source.videoWidth, height: source.videoHeight };
  return { width: source.width, height: source.height };
}

function centreInside(box: readonly number[], card: CardRect): boolean {
  const [x = 0, y = 0, w = 0, h = 0] = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return cx >= card.x && cx <= card.x + card.width && cy >= card.y && cy <= card.y + card.height;
}

function cropCard(source: IdentitySource, card: CardRect): OffscreenCanvas {
  const { width, height } = sourceSize(source);
  const sx = Math.max(0, Math.round(card.x * width));
  const sy = Math.max(0, Math.round(card.y * height));
  const sw = Math.max(1, Math.min(width - sx, Math.round(card.width * width)));
  const sh = Math.max(1, Math.min(height - sy, Math.round(card.height * height)));
  const scale = Math.max(1, CARD_CROP_MIN_WIDTH / sw);
  const canvas = new OffscreenCanvas(Math.round(sw * scale), Math.round(sh * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context for the card crop");
  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function largest<T extends { box: readonly number[] }>(faces: readonly T[]): T | undefined {
  let best: T | undefined;
  let bestArea = -1;
  for (const face of faces) {
    const area = (face.box[2] ?? 0) * (face.box[3] ?? 0);
    if (area > bestArea) {
      best = face;
      bestArea = area;
    }
  }
  return best;
}

export function createIdentityCheck(options: IdentityCheckOptions): IdentityCheck {
  let human: Human | null = null;
  let ocr: Tesseract.Worker | null = null;

  async function load(): Promise<void> {
    if (!human) {
      const module = await import("@vladmandic/human");
      const HumanClass = module.Human ?? module.default;
      const instance = new HumanClass(humanConfig(options));
      await instance.load();
      human = instance;
    }
    if (!ocr) {
      const module = await import("tesseract.js");
      const tesseract =
        (module as { default?: typeof Tesseract }).default ?? (module as unknown as typeof Tesseract);
      const worker = await tesseract.createWorker("eng", tesseract.OEM.LSTM_ONLY, {
        workerPath: options.tesseract.workerPath,
        corePath: options.tesseract.corePath,
        langPath: options.tesseract.langPath,
        workerBlobURL: false,
        cacheMethod: "none",
        gzip: false,
        logger: () => {},
        errorHandler: () => {},
      });
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789",
        tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
      });
      ocr = worker;
    }
  }

  return {
    load,

    async sample(source, card, sampleOptions = {}) {
      await load();
      const h = human;
      if (!h) throw new Error("Human did not load");
      const full = await h.detect(source);
      const live = full.face.filter((face) => !centreInside(face.boxRaw, card));
      const insideFull = full.face.filter((face) => centreInside(face.boxRaw, card));

      const crop = cropCard(source, card);
      const cropResult = await h.detect(crop);
      const cardFace = largest(cropResult.face) ?? largest(insideFull);
      const liveFace = largest(live);

      let similarity: number | null = null;
      if (liveFace?.embedding?.length && cardFace?.embedding?.length) {
        similarity = round3(h.match.similarity(liveFace.embedding, cardFace.embedding));
      }

      let digits: string[] | null = null;
      if (sampleOptions.ocr && ocr) {
        const { data } = await ocr.recognize(crop);
        digits = digitRuns(data.text);
      }
      return { liveFaces: live.length, cardFace: cardFace !== undefined, similarity, digits };
    },

    async dispose() {
      if (human) {
        for (const model of Object.values(human.models.models)) {
          (model as { dispose?: () => void } | null)?.dispose?.();
        }
        human.models.reset();
        human = null;
      }
      if (ocr) {
        await ocr.terminate();
        ocr = null;
      }
    },
  };
}
