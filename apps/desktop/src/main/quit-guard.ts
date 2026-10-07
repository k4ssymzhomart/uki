// "before-quit is cancelled until submit or end" (Hardening in docs/phase-0-plan.md): while the exam
// holds the app, Cmd+Q, the Dock's Quit, the app menu and app.quit() all stop at before-quit, and closing
// the window does nothing (it would end the renderer, and detection with it). The exam holds the app
// while lockdown is on (exam in the app), while the window is in the tray (exam in the browser), and
// while the exam's process scan runs: the renderer keeps the scan on from the exam's start until 3.1
// or 2.1d in both modes (wantsExamWatch in the renderer's flow/derive.ts), which also covers the moments
// a browser exam's window is out of the tray (2.1c, 2.1e, a submit that waits for the network).

/** The part of Electron's `app` this module uses. */
export interface QuitEvents {
  on(event: "before-quit", listener: (event: { preventDefault(): void }) => void): unknown;
}

/** What holds the app during an exam: lockdown.ts, tray.ts and the scan.ts watcher. */
export interface ExamHolds {
  lockdown: { readonly active: boolean };
  trayMode: { readonly active: boolean };
  watcher: { readonly running: boolean };
}

export function examHolds(holds: ExamHolds): () => boolean {
  return () => holds.lockdown.active || holds.trayMode.active || holds.watcher.running;
}

export function guardQuit(app: QuitEvents, examHoldsApp: () => boolean): void {
  app.on("before-quit", (event) => {
    if (examHoldsApp()) event.preventDefault();
  });
}

/** The part of a BrowserWindow this module uses. */
export interface ClosableWindow {
  on(event: "close", listener: (event: { preventDefault(): void }) => void): unknown;
  removeListener(event: "close", listener: (event: { preventDefault(): void }) => void): unknown;
}

/** Refuses to close the window while the exam holds the app; returns a detach. */
export function guardClose(window: ClosableWindow, examHoldsApp: () => boolean): () => void {
  const onClose = (event: { preventDefault(): void }) => {
    if (examHoldsApp()) event.preventDefault();
  };
  window.on("close", onClose);
  return () => {
    window.removeListener("close", onClose);
  };
}
