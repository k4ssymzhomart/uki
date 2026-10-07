import type { DesktopOs } from "@uki/contracts";

/** The catalog key of each operating system, for the E.3 line lock.pair.device ("{os} · {student}"). */
export const OS_KEYS = { macos: "os.macos", windows: "os.windows" } as const satisfies Record<
  DesktopOs,
  string
>;

/** "482 913": the code in two groups, as E.3 draws it. */
export function groupCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
