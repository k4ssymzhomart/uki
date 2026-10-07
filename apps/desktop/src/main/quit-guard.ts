// "before-quit is cancelled until submit or end" (Hardening in docs/phase-0-plan.md): while the exam
// holds the app (lockdown in the app, the tray in a browser exam), Cmd+Q, the Dock's Quit, the app menu
// and app.quit() all stop at before-quit.

/** The part of Electron's `app` this module uses. */
export interface QuitEvents {
  on(event: "before-quit", listener: (event: { preventDefault(): void }) => void): unknown;
}

export function guardQuit(app: QuitEvents, examHoldsApp: () => boolean): void {
  app.on("before-quit", (event) => {
    if (examHoldsApp()) event.preventDefault();
  });
}
