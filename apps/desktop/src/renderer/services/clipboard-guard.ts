// Copy and paste in the exam renderer (C1 in docs/finals-plan.md; case section 2.3). While lockdown is
// on, on every OS, the window cancels copy, cut, paste, the context menu and drop in the capture phase,
// before any element sees them. Key, input and beforeinput events are left alone, so every text field
// (Ask proctor's note) takes typing as before. On Windows the keyboard hook already swallows
// Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+Insert and Shift+Insert (main/key-filter.ts); this guard also covers macOS,
// whose Edit menu keeps Cmd+C and Cmd+V for the join form (main/menu.ts), and a paste that reaches the
// page any other way. The main process clears the clipboard when lockdown starts (main/lockdown.ts).

/** The events the guard cancels. */
export const GUARDED_EVENTS = ["copy", "cut", "paste", "contextmenu", "drop"] as const;

/** Where the guard listens: the renderer's window. */
export type GuardTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

const CAPTURE = { capture: true } as const;

function cancel(event: Event): void {
  event.preventDefault();
}

/** Starts cancelling the guarded events on `target`; returns the function that stops it. */
export function guardClipboard(target: GuardTarget): () => void {
  for (const type of GUARDED_EVENTS) target.addEventListener(type, cancel, CAPTURE);
  return () => {
    for (const type of GUARDED_EVENTS) target.removeEventListener(type, cancel, CAPTURE);
  };
}
