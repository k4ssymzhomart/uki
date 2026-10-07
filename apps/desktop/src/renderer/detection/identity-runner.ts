// The card match on 1.3 and 1.3a ("Identity check on 1.3" in docs/phase-0-plan.md). Human and
// Tesseract.js load when 1.3 opens (a lazy import of @uki/detection/identity) and are disposed after the
// match. Each try looks at the live camera for a few seconds, reading the card's digits on two frames,
// and `decide` gives the verdict; after the third failed try the flow shows 1.3a and the check keeps
// trying. Nothing is stored or sent: the flow sends only identity.matched { score, tries }.

import { modelUrls } from "@uki/detection";
import type { CardRect, IdentityCheck, IdentityObservation, IdentityVerdict } from "@uki/detection/identity";
import { modelsBase } from "./runtime.ts";

/** One try samples the camera this long. */
export const TRY_MS = 3_000;
/** Between samples within a try. */
export const SAMPLE_GAP_MS = 250;
/** Samples per try that also read the digits (OCR is slow). */
export const OCR_SAMPLES = 2;
/** Pause between tries, so the student can adjust the card. */
export const BETWEEN_TRIES_MS = 1_000;

type IdentityModule = typeof import("@uki/detection/identity");

export interface IdentityRunnerOptions {
  /** The camera stream (the detection runtime's); null until it opens. */
  stream: () => MediaStream | null;
  studentNumber: string;
  /** The card frame in camera coordinates (not mirrored). */
  cardRect: CardRect;
  onStatus(status: "loading" | "checking" | "error"): void;
  onVerdict(verdict: IdentityVerdict): void;
  loadModule?: () => Promise<IdentityModule>;
  /** Tests: a fake video source. */
  makeSource?: (stream: MediaStream) => Promise<HTMLVideoElement>;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A muted, unattached <video> playing the stream: Human and Tesseract read frames from it. */
async function videoFor(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  if (video.videoWidth === 0) {
    await new Promise<void>((resolve) =>
      video.addEventListener("loadeddata", () => resolve(), { once: true }),
    );
  }
  return video;
}

export class IdentityRunner {
  private readonly options: IdentityRunnerOptions;
  private readonly sleep: (ms: number) => Promise<void>;
  private running = false;
  private check: IdentityCheck | null = null;
  private video: HTMLVideoElement | null = null;
  private loop: Promise<void> | null = null;

  constructor(options: IdentityRunnerOptions) {
    this.options = options;
    this.sleep = options.sleep ?? defaultSleep;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop = this.run().catch(() => {
      if (this.running) this.options.onStatus("error");
    });
  }

  /** Stops trying and frees Human, Tesseract and the video element. */
  async stop(): Promise<void> {
    this.running = false;
    await this.loop?.catch(() => {});
    this.loop = null;
    await this.release();
  }

  private async release(): Promise<void> {
    const check = this.check;
    this.check = null;
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video = null;
    }
    await check?.dispose().catch(() => {});
  }

  private async run(): Promise<void> {
    const { options } = this;
    options.onStatus("loading");
    const module = await (options.loadModule ?? (() => import("@uki/detection/identity")))();
    const urls = modelUrls(modelsBase());
    const check = module.createIdentityCheck({ humanBase: urls.humanBase, tesseract: urls.tesseract });
    this.check = check;
    await check.load();
    let stream = options.stream();
    while (this.running && !stream) {
      await this.sleep(500);
      stream = options.stream();
    }
    if (!this.running || !stream) return;
    this.video = await (options.makeSource ?? videoFor)(stream);
    options.onStatus("checking");

    let tries = 0;
    while (this.running) {
      tries += 1;
      const observations: IdentityObservation[] = [];
      const started = Date.now();
      let sample = 0;
      while (this.running && (Date.now() - started < TRY_MS || observations.length === 0)) {
        try {
          observations.push(await check.sample(this.video, options.cardRect, { ocr: sample < OCR_SAMPLES }));
        } catch {
          // A frame Human could not read: skip it.
        }
        sample += 1;
        if (sample > 40) break;
        await this.sleep(SAMPLE_GAP_MS);
      }
      if (!this.running) return;
      const verdict = module.decide({ observations, studentNumber: options.studentNumber, tries });
      options.onVerdict(verdict);
      if (verdict.kind === "matched") {
        this.running = false;
        await this.release();
        return;
      }
      await this.sleep(BETWEEN_TRIES_MS);
    }
  }
}
