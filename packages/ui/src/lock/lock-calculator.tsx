import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

/** E.5b's keys: digits, the point, the four operations, =, C, ± and %. */
export type LockCalculatorKey =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "."
  | "+"
  | "-"
  | "*"
  | "/"
  | "="
  | "clear"
  | "sign"
  | "percent";

type KeyTone = "function" | "digit" | "operator" | "equals";

interface KeySpec {
  key: LockCalculatorKey;
  /** The symbol on the key; C comes from the catalog (clearLabel). */
  symbol?: string;
  tone: KeyTone;
  wide?: boolean;
}

/** The keypad as E.5b draws it (Keypad 153:11873), row by row. */
const ROWS: readonly (readonly KeySpec[])[] = [
  [
    { key: "clear", tone: "function" },
    { key: "sign", symbol: "±", tone: "function" },
    { key: "percent", symbol: "%", tone: "function" },
    { key: "/", symbol: "÷", tone: "operator" },
  ],
  [
    { key: "7", symbol: "7", tone: "digit" },
    { key: "8", symbol: "8", tone: "digit" },
    { key: "9", symbol: "9", tone: "digit" },
    { key: "*", symbol: "×", tone: "operator" },
  ],
  [
    { key: "4", symbol: "4", tone: "digit" },
    { key: "5", symbol: "5", tone: "digit" },
    { key: "6", symbol: "6", tone: "digit" },
    { key: "-", symbol: "−", tone: "operator" },
  ],
  [
    { key: "1", symbol: "1", tone: "digit" },
    { key: "2", symbol: "2", tone: "digit" },
    { key: "3", symbol: "3", tone: "digit" },
    { key: "+", symbol: "+", tone: "operator" },
  ],
  [
    { key: "0", symbol: "0", tone: "digit", wide: true },
    { key: ".", symbol: ".", tone: "digit" },
    { key: "=", symbol: "=", tone: "equals" },
  ],
];

const KEY_TONES: Record<KeyTone, string> = {
  function: "bg-subtle text-fg-primary hover:bg-pressed active:bg-pressed",
  digit: "bg-subtle text-fg-primary hover:bg-pressed active:bg-pressed",
  operator: "bg-inverse text-fg-inverse hover:bg-inverse-hover active:bg-inverse-pressed",
  equals: "bg-brand text-fg-on-brand hover:bg-brand-hover active:bg-brand-pressed",
};

export interface LockCalculatorProps extends Omit<ComponentProps<"div">, "children" | "onKeyDown"> {
  /** The expression line, "2 × 25 ÷ 2". */
  expression: ReactNode;
  /** The big value, "25"; or the error message when `error` is set. */
  value: ReactNode;
  /** A long value or an error message steps down from Heading/H2 to Heading/H3 so it fits the display. */
  compact?: boolean;
  /** The value is an error message ("Can't divide by 0"). */
  error?: boolean;
  /** The C key's label (lock.calc.clear). */
  clearLabel: ReactNode;
  /** "Works offline. Keeps no history after you submit." (lock.calc.note). */
  note?: ReactNode;
  onKey: (key: LockCalculatorKey) => void;
}

/**
 * E.5b's calculator card (Figma 153:11869): the display with the expression and the value, the 5-row keypad,
 * and the note. Presentational: the app keeps the state and passes what to show.
 */
export function LockCalculator({
  expression,
  value,
  compact = false,
  error = false,
  clearLabel,
  note,
  onKey,
  className,
  ...props
}: LockCalculatorProps) {
  return (
    <div
      className={cn(
        "flex w-96 flex-col items-stretch gap-4 rounded-card border border-line-default bg-surface p-5 text-fg-primary shadow-float",
        className,
      )}
      {...props}
    >
      <div
        data-uki-calc-display=""
        className="flex flex-col items-end gap-0.5 overflow-hidden whitespace-nowrap rounded-md bg-subtle px-4 py-3"
      >
        <p data-uki-calc-expression="" className="type-mono-m min-h-7 opacity-55">
          {expression}
        </p>
        <p
          data-uki-calc-value=""
          data-error={error ? "" : undefined}
          aria-live="polite"
          className={cn("flex min-h-13 items-center", compact || error ? "type-h3" : "type-h2")}
        >
          {value}
        </p>
      </div>
      <div className="flex flex-col items-stretch gap-2">
        {ROWS.map((row) => (
          <div key={row.map((spec) => spec.key).join("")} className="flex items-stretch gap-2">
            {row.map((spec) => (
              <button
                key={spec.key}
                type="button"
                data-uki-calc-key={spec.key}
                onClick={() => onKey(spec.key)}
                className={cn(
                  "flex h-15 min-w-0 items-center justify-center rounded-md type-ui-title outline-none focus-visible:shadow-focus",
                  spec.wide ? "flex-2" : "flex-1",
                  KEY_TONES[spec.tone],
                )}
              >
                <span className={cn(spec.tone === "function" && "opacity-70")}>
                  {spec.symbol ?? clearLabel}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {note ? <p className="type-card-caption opacity-60">{note}</p> : null}
    </div>
  );
}
