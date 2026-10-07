// The app side of pairing (E.3): while Üki Lock asks to pair, the window shows the 6-digit code from the
// relay (window.uki.lock.onPairCode) on its pairing card, during check-in only. The card's "Next" line
// names the joined exam and its start; before a join it is left out.
import { type FlowSnapshot, type FlowStage, stageOf } from "../flow/derive.ts";

export interface PairingCardModel {
  /** Six digits as the relay made them. */
  code: string;
  /** The joined exam for pair.card.next (its title, as Figma's "Physics 1 · Quiz 3"); null before a join. */
  exam: { title: string; startsAt: number } | null;
}

/** Check-in frames (1.1 to 1.4) show the card; the exam and the receipt never do. */
export const PAIRING_STAGES: readonly FlowStage[] = [
  "boot",
  "join",
  "joining",
  "system",
  "identity",
  "identityHelp",
  "identityMatched",
  "rules",
];

export function selectPairing(snapshot: FlowSnapshot): PairingCardModel | null {
  const { pairCode, joined } = snapshot.context;
  if (!pairCode || !PAIRING_STAGES.includes(stageOf(snapshot))) return null;
  return {
    code: pairCode.code,
    exam: joined ? { title: joined.exam.title, startsAt: Date.parse(joined.exam.starts_at) } : null,
  };
}

export function samePairing(a: PairingCardModel | null, b: PairingCardModel | null): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** "482 913": the code in two groups of three, as E.3 draws it on both sides. */
export function groupPairCode(code: string): string {
  return /^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** Same calendar day in Asia/Almaty (UTC+5, no daylight saving), for the "Next" line's time. */
export function sameAlmatyDay(a: number, b: number): boolean {
  const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;
  const day = (ms: number) => Math.floor((ms + ALMATY_OFFSET_MS) / 86_400_000);
  return day(a) === day(b);
}
