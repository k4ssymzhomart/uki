// E.5b's calculator (Figma 153:11724; "Calculator" in the Decisions of docs/phase-1-plan.md): the four
// operations, percent and sign. A pure reducer over one small state: no history, no storage, no network.
// The component that holds the state lives in the Lock bar's shadow root and goes away when the student
// leaves the Calculator tab, so closing it clears everything.
//
// The display shows the expression on its first line, as E.5b draws it ("2 × 25 ÷ 2"), so evaluation keeps
// the usual order of operations: × and ÷ before + and −.

/** The keys of E.5b's keypad, plus Backspace from the keyboard. */
export const CALC_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
export const CALC_OPERATORS = ["+", "-", "*", "/"] as const;
export type CalcDigit = (typeof CALC_DIGITS)[number];
export type CalcOperator = (typeof CALC_OPERATORS)[number];
export type CalcKey = CalcDigit | CalcOperator | "." | "=" | "clear" | "sign" | "percent" | "backspace";

/** Digits one entry may hold. */
export const CALC_MAX_DIGITS = 12;
/** Significant digits a result keeps: enough for exam arithmetic, and 0.1 + 0.2 shows 0.3. */
const RESULT_PRECISION = 12;

export interface CalcState {
  /** Numbers and operators already entered, alternating; ends with an operator while a number is typed. */
  items: readonly (number | CalcOperator)[];
  /** The number being typed, as typed ("0.", "-12"); empty right after an operator. */
  entry: string;
  /** After =: `items` is the whole expression and `entry` its result. */
  done: boolean;
  /** A division by zero: shown until the next key starts again. */
  error: boolean;
}

export const CALC_INITIAL: CalcState = { items: [], entry: "", done: false, error: false };

/** What the display shows: the expression line and the big value. */
export interface CalcDisplay {
  expression: string;
  value: string;
  error: boolean;
}

const OPERATOR_SIGNS: Record<CalcOperator, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

function isOperator(item: number | CalcOperator): item is CalcOperator {
  return typeof item === "string";
}

function digitCount(entry: string): number {
  return entry.replace(/[^0-9]/g, "").length;
}

/** A number as the display and the next entry take it: at most 12 significant digits, never "-0". */
export function formatNumber(value: number): string {
  if (Object.is(value, -0) || value === 0) return "0";
  const rounded = Number.parseFloat(value.toPrecision(RESULT_PRECISION));
  return String(rounded);
}

function parseEntry(entry: string): number {
  const value = Number.parseFloat(entry);
  return Number.isFinite(value) ? value : 0;
}

/** Evaluates numbers and operators, × and ÷ first. Null on a division by zero or an overflow. */
export function evaluate(items: readonly (number | CalcOperator)[]): number | null {
  const first = items[0];
  if (first === undefined || isOperator(first)) return 0;
  const terms: number[] = [first];
  const signs: ("+" | "-")[] = [];
  for (let i = 1; i + 1 < items.length; i += 2) {
    const op = items[i];
    const next = items[i + 1];
    if (op === undefined || next === undefined || !isOperator(op) || isOperator(next)) return null;
    if (op === "*" || op === "/") {
      const left = terms.pop() ?? 0;
      if (op === "/" && next === 0) return null;
      terms.push(op === "*" ? left * next : left / next);
    } else {
      signs.push(op);
      terms.push(next);
    }
  }
  let result = terms[0] ?? 0;
  signs.forEach((sign, index) => {
    const term = terms[index + 1] ?? 0;
    result = sign === "+" ? result + term : result - term;
  });
  return Number.isFinite(result) ? result : null;
}

/** The items without a trailing operator. */
function complete(items: readonly (number | CalcOperator)[]): (number | CalcOperator)[] {
  const last = items.at(-1);
  return last !== undefined && isOperator(last) ? items.slice(0, -1) : [...items];
}

function typeDigit(state: CalcState, digit: CalcDigit): CalcState {
  if (state.done || state.error) return { ...CALC_INITIAL, entry: digit };
  if (digitCount(state.entry) >= CALC_MAX_DIGITS) return state;
  if (state.entry === "0") return { ...state, entry: digit };
  if (state.entry === "-0") return { ...state, entry: `-${digit}` };
  return { ...state, entry: state.entry + digit };
}

function typePoint(state: CalcState): CalcState {
  if (state.done || state.error) return { ...CALC_INITIAL, entry: "0." };
  if (state.entry.includes(".")) return state;
  if (state.entry === "" || state.entry === "-") return { ...state, entry: `${state.entry}0.` };
  return { ...state, entry: `${state.entry}.` };
}

function typeOperator(state: CalcState, op: CalcOperator): CalcState {
  if (state.error) return state;
  if (state.done) return { items: [parseEntry(state.entry), op], entry: "", done: false, error: false };
  if (state.entry === "") {
    if (state.items.length === 0) return { ...state, items: [0, op] };
    return { ...state, items: [...state.items.slice(0, -1), op] };
  }
  return { ...state, items: [...state.items, parseEntry(state.entry), op], entry: "" };
}

function equals(state: CalcState): CalcState {
  if (state.error || state.done) return state;
  if (state.entry === "" && state.items.length === 0) return state;
  const items = state.entry === "" ? complete(state.items) : [...state.items, parseEntry(state.entry)];
  const result = evaluate(items);
  if (result === null) return { items, entry: "", done: false, error: true };
  return { items, entry: formatNumber(result), done: true, error: false };
}

function negate(state: CalcState): CalcState {
  if (state.error) return state;
  if (state.done) return { ...CALC_INITIAL, entry: formatNumber(-parseEntry(state.entry)) };
  if (state.entry === "") return { ...state, entry: "-0" };
  return { ...state, entry: state.entry.startsWith("-") ? state.entry.slice(1) : `-${state.entry}` };
}

/** x % is x / 100, except after + or −, where it is that share of what comes before: 200 + 10 % is 200 + 20. */
function percent(state: CalcState): CalcState {
  if (state.error) return state;
  if (state.done) return { ...CALC_INITIAL, entry: formatNumber(parseEntry(state.entry) / 100) };
  if (state.entry === "") return state;
  const x = parseEntry(state.entry);
  const op = state.items.at(-1);
  const base = op === "+" || op === "-" ? evaluate(complete(state.items)) : null;
  const value = base === null ? x / 100 : (base * x) / 100;
  return { ...state, entry: formatNumber(value) };
}

function backspace(state: CalcState): CalcState {
  if (state.done || state.error) return CALC_INITIAL;
  const entry = state.entry.slice(0, -1);
  return { ...state, entry: entry === "-" ? "" : entry };
}

export function calcReducer(state: CalcState, key: CalcKey): CalcState {
  switch (key) {
    case "clear":
      return CALC_INITIAL;
    case ".":
      return typePoint(state);
    case "=":
      return equals(state);
    case "sign":
      return negate(state);
    case "percent":
      return percent(state);
    case "backspace":
      return backspace(state);
    case "+":
    case "-":
    case "*":
    case "/":
      return typeOperator(state, key);
    default:
      return typeDigit(state, key);
  }
}

/** A number for the display: the minus sign is U+2212, as on the keypad. */
function showNumber(value: string): string {
  return value.startsWith("-") ? `−${value.slice(1)}` : value;
}

function showItems(items: readonly (number | CalcOperator)[]): string {
  return items
    .map((item) => (isOperator(item) ? OPERATOR_SIGNS[item] : showNumber(formatNumber(item))))
    .join(" ");
}

export function calcDisplay(state: CalcState): CalcDisplay {
  if (state.error) return { expression: showItems(state.items), value: "", error: true };
  if (state.done) return { expression: showItems(state.items), value: showNumber(state.entry), error: false };
  // Right after an operator the value still shows the number before it, as pocket calculators do.
  const last = state.items.findLast((item): item is number => !isOperator(item));
  const value = state.entry === "" ? formatNumber(last ?? 0) : state.entry;
  return { expression: showItems(state.items), value: showNumber(value), error: false };
}

/** The key a keyboard press means while the calculator is open, or null for any other key. */
export function keyFromKeyboard(key: string): CalcKey | null {
  if ((CALC_DIGITS as readonly string[]).includes(key)) return key as CalcDigit;
  switch (key) {
    case ".":
    case ",":
      return ".";
    case "+":
    case "-":
    case "*":
    case "/":
      return key;
    case "x":
    case "X":
    case "×":
      return "*";
    case "÷":
      return "/";
    case "%":
      return "percent";
    case "=":
    case "Enter":
      return "=";
    case "Escape":
    case "Delete":
    case "c":
    case "C":
      return "clear";
    case "Backspace":
      return "backspace";
    default:
      return null;
  }
}
