// The simulator's log: one line per event worth knowing, appended to <logs>/judge-sim.log, rotated by
// size into judge-sim.1.log … judge-sim.<files-1>.log (the oldest is dropped), so the VPS never holds
// more than files × maxBytes of logs. Also written to stdout. Never given a token or a key.
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

export type Level = "info" | "warn" | "error";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface RotatingLogOptions {
  dir: string;
  /** Rotate once the current file reaches this size. */
  maxBytes: number;
  /** Files kept in all, the current one included (2 to 20). */
  files: number;
  name?: string;
  /** Also write to stdout (default true). */
  stdout?: boolean;
  now?: () => Date;
}

export const LOG_DEFAULTS = { maxBytes: 5 * 1024 * 1024, files: 5 } as const;

/** judge-sim.log, judge-sim.1.log, …: the file names of a rotation set, newest first. */
export function rotationNames(name: string, files: number): string[] {
  return Array.from({ length: files }, (_, i) => (i === 0 ? `${name}.log` : `${name}.${i}.log`));
}

export class RotatingLog implements Logger {
  private readonly names: string[];
  private size: number;
  private readonly options: Required<RotatingLogOptions>;

  constructor(options: RotatingLogOptions) {
    this.options = {
      name: "judge-sim",
      stdout: true,
      now: () => new Date(),
      ...options,
      files: Math.min(Math.max(Math.trunc(options.files), 2), 20),
    };
    mkdirSync(this.options.dir, { recursive: true });
    this.names = rotationNames(this.options.name, this.options.files);
    const current = this.path(0);
    this.size = existsSync(current) ? statSync(current).size : 0;
  }

  private path(index: number): string {
    return join(this.options.dir, this.names[index] as string);
  }

  private rotate(): void {
    const last = this.path(this.names.length - 1);
    if (existsSync(last)) rmSync(last, { force: true });
    for (let i = this.names.length - 2; i >= 0; i -= 1) {
      const from = this.path(i);
      if (existsSync(from)) renameSync(from, this.path(i + 1));
    }
    this.size = 0;
  }

  write(level: Level, message: string): void {
    const line = `${this.options.now().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}\n`;
    const bytes = Buffer.byteLength(line);
    try {
      if (this.size > 0 && this.size + bytes > this.options.maxBytes) this.rotate();
      appendFileSync(this.path(0), line);
      this.size += bytes;
    } catch {
      // A full disk or a locked file must not stop the simulator; stdout still has the line.
    }
    if (this.options.stdout) process.stdout.write(line);
  }

  info(message: string): void {
    this.write("info", message);
  }
  warn(message: string): void {
    this.write("warn", message);
  }
  error(message: string): void {
    this.write("error", message);
  }
}

/** A logger that only writes to stdout (the dry run). */
export const consoleLog: Logger = {
  info: (message) => process.stdout.write(`${message}\n`),
  warn: (message) => process.stdout.write(`${message}\n`),
  error: (message) => process.stderr.write(`${message}\n`),
};
