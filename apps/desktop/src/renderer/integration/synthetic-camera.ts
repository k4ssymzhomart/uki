// A synthetic camera for development and e2e builds only (camera-mode.ts): a 640 × 480 canvas stream
// drawn from the brand kit's evidence pictures, fed to the same detection pipeline as a real camera.
// Production builds never import this module.
//
// The picture follows a scene the test (or a developer in DevTools) sets through
// window.ukiSyntheticCamera.set({ ... }):
//   subject  "present" (one student looking at the screen), "phone" (the same student holding a phone),
//            "absent" (the empty seat)
//   card     "auto" shows a student card in the 1.3 card frame while the identity check runs, with the
//            joined student's number and the student's own photo; "shown" and "hidden" force it
//   cardNumber  the number printed on the card; null (the default) prints the joined student's, and
//            another number makes the card match fail on the number while the face still matches (1.3a)
// The card sits at cameraCardRect() in camera coordinates, exactly where the identity check reads it.
import { type Camera, cameraFromStream, FULL_INPUT, type InputSize } from "@uki/detection";
import emptySeat from "../screens/gallery-assets/uki-evidence-empty-seat.jpg";
import normal from "../screens/gallery-assets/uki-evidence-normal.jpg";
import phone from "../screens/gallery-assets/uki-evidence-phone.jpg";
import { type CardGeometry, cardGeometry, coverSource, FACE_IN_PORTRAIT } from "./synthetic-geometry.ts";

export type SyntheticSubject = "present" | "phone" | "absent";
export type SyntheticCard = "auto" | "shown" | "hidden";

export interface SyntheticScene {
  subject: SyntheticSubject;
  card: SyntheticCard;
  /** The number printed on the card; null prints the joined student's. */
  cardNumber: string | null;
}

export interface SyntheticCameraControl {
  get(): SyntheticScene;
  set(patch: Partial<SyntheticScene>): SyntheticScene;
}

declare global {
  interface Window {
    /** Development and e2e builds with the synthetic camera only. */
    ukiSyntheticCamera?: SyntheticCameraControl;
  }
}

export interface SyntheticCameraOptions {
  /** The card frame in camera coordinates (not mirrored), shares of the picture. */
  cardRect: { x: number; y: number; width: number; height: number };
  /** True while the identity check reads the card (scene card "auto"). */
  cardWanted: () => boolean;
  /** The number printed on the card: the joined student's. */
  studentNumber: () => string | null;
  /** Frames a second; the real camera asks for 30. */
  frameRate?: number;
}

const SUBJECT_SRC: Record<SyntheticSubject, string> = { present: normal, phone, absent: emptySeat };

let scene: SyntheticScene = { subject: "present", card: "auto", cardNumber: null };

export const syntheticCameraControl: SyntheticCameraControl = {
  get: () => ({ ...scene }),
  set(patch) {
    scene = { ...scene, ...patch };
    return { ...scene };
  },
};

if (typeof window !== "undefined") window.ukiSyntheticCamera = syntheticCameraControl;

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, size: InputSize): void {
  const source = coverSource({ width: image.naturalWidth, height: image.naturalHeight }, size);
  context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, size.width, size.height);
}

function drawCard(
  context: CanvasRenderingContext2D,
  portrait: HTMLImageElement,
  geometry: CardGeometry,
  studentNumber: string,
): void {
  const { card, photo, digits } = geometry;
  // Development-only drawing: plain canvas colours, not tokens (this picture stands in for a camera).
  context.save();
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#9a9a9a";
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(card.x, card.y, card.width, card.height, 6);
  context.fill();
  context.stroke();
  const face = FACE_IN_PORTRAIT;
  context.drawImage(
    portrait,
    face.x * portrait.naturalWidth,
    face.y * portrait.naturalHeight,
    face.width * portrait.naturalWidth,
    face.height * portrait.naturalHeight,
    photo.x,
    photo.y,
    photo.width,
    photo.height,
  );
  context.fillStyle = "#000000";
  context.font = `700 ${digits.fontPx}px Helvetica, Arial, sans-serif`;
  context.textBaseline = "middle";
  context.fillText(studentNumber, digits.x, digits.y, digits.maxWidth);
  context.restore();
}

/** Opens the synthetic camera: a canvas stream, pumped like a real one. */
export async function openSyntheticCamera(options: SyntheticCameraOptions): Promise<Camera> {
  const size = FULL_INPUT;
  const [present, holdingPhone, empty] = await Promise.all([
    loadImage(SUBJECT_SRC.present),
    loadImage(SUBJECT_SRC.phone),
    loadImage(SUBJECT_SRC.absent),
  ]);
  const images: Record<SyntheticSubject, HTMLImageElement> = {
    present,
    phone: holdingPhone,
    absent: empty,
  };
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("synthetic camera: no 2d context");
  const geometry = cardGeometry(options.cardRect, size);

  const draw = (): void => {
    drawCover(context, images[scene.subject], size);
    const number = scene.cardNumber ?? options.studentNumber();
    const showCard = scene.card === "shown" || (scene.card === "auto" && options.cardWanted());
    if (showCard && number && scene.subject !== "absent") drawCard(context, present, geometry, number);
  };
  draw();

  const frameRate = options.frameRate ?? 30;
  const stream = canvas.captureStream(frameRate);
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error("synthetic camera: no video track");
  // A canvas track only carries a frame after a draw: keep drawing at the camera's rate. The window
  // never throttles timers (backgroundThrottling is off), so a hidden window keeps its rate too.
  const timer = setInterval(draw, 1000 / frameRate);
  const camera = cameraFromStream(stream, track, { frameRate });

  return {
    stream,
    track,
    get source() {
      return camera.source;
    },
    start: (handlers) => camera.start(handlers),
    setInputSize: (input) => camera.setInputSize(input),
    stop: () => {
      clearInterval(timer);
      camera.stop();
    },
  };
}
