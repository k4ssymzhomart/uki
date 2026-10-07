// Packaged builds refuse to start with a remote-debugging or inspector switch. DevTools are off in the
// window, but `--remote-debugging-port` would still let another program drive the page (and call
// window.uki.exam.lockdown(false)); the fuses already turn off --inspect and NODE_OPTIONS. Chromium's
// fake capture switches are refused too: they would feed a recorded video to detection instead of the
// camera.

/** Chromium and Node switches that open the app to a debugger, or replace the camera. */
export const DEBUG_SWITCHES = [
  "remote-debugging-port",
  "remote-debugging-pipe",
  "remote-debugging-address",
  "inspect",
  "inspect-brk",
  "inspect-port",
  "use-fake-device-for-media-stream",
  "use-file-for-fake-video-capture",
] as const;

/** The parts of app.commandLine this module reads. */
export interface CommandLineLike {
  hasSwitch(name: string): boolean;
}

/** The first debug switch present, or null. Also catches `--inspect=9229` style arguments in argv. */
export function findDebugSwitch(commandLine: CommandLineLike, argv: readonly string[]): string | null {
  for (const name of DEBUG_SWITCHES) {
    if (commandLine.hasSwitch(name)) return name;
    if (argv.some((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`))) return name;
  }
  return null;
}
