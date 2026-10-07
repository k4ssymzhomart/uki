import type { DesktopOs } from "@uki/contracts";

/**
 * Operating system names for the E.3 line "{os} · {student}". Trade names read the same in Kazakh, Russian
 * and English, and the catalog has no key for them yet (docs: open issue for the i18n owner).
 */
const OS_NAMES: Record<DesktopOs, string> = { macos: "macOS", windows: "Windows" };

export function osName(os: DesktopOs): string {
  return OS_NAMES[os];
}

/** "Windows · Aliya S." as on E.3, or the OS alone before the student joins. */
export function deviceLine(os: DesktopOs, studentName: string | null): string {
  return studentName ? `${osName(os)} · ${studentName}` : osName(os);
}

/** "482 913": the code in two groups, as E.3 draws it. */
export function groupCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
