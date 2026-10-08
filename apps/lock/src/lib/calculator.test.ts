import { describe, expect, it } from "vitest";
import {
  CALC_INITIAL,
  CALC_MAX_DIGITS,
  type CalcKey,
  type CalcState,
  calcDisplay,
  calcReducer,
  evaluate,
  formatNumber,
  keyFromKeyboard,
} from "./calculator.ts";

/** Presses keys from a string: digits, ".", + - * /, "=", "C" clear, "±" sign, "%" percent, "<" backspace. */
function press(keys: string, from: CalcState = CALC_INITIAL): CalcState {
  const map: Record<string, CalcKey> = { C: "clear", "±": "sign", "%": "percent", "<": "backspace" };
  return [...keys].reduce((state, key) => calcReducer(state, map[key] ?? (key as CalcKey)), from);
}

function show(keys: string): [string, string] {
  const display = calcDisplay(press(keys));
  return [display.expression, display.value];
}

describe("E.5b calculator", () => {
  it("shows 0 before any key", () => {
    expect(calcDisplay(CALC_INITIAL)).toEqual({ expression: "", value: "0", error: false });
  });

  it("works E.5b's example: 2 × 25 ÷ 2 = 25, with the expression above the result", () => {
    expect(show("2*25/2")).toEqual(["2 × 25 ÷", "2"]);
    expect(show("2*25/2=")).toEqual(["2 × 25 ÷ 2", "25"]);
  });

  it("does the four operations, × and ÷ before + and −", () => {
    expect(show("12+30=")[1]).toBe("42");
    expect(show("7-10=")[1]).toBe("−3");
    expect(show("2+3*4=")).toEqual(["2 + 3 × 4", "14"]);
    expect(show("20-6/3=")[1]).toBe("18");
    expect(show("1/3=")[1]).toBe("0.333333333333");
    expect(evaluate([2, "*", 3, "+", 4, "*", 5])).toBe(26);
  });

  it("keeps decimals clean: 0.1 + 0.2 is 0.3", () => {
    expect(show("0.1+0.2=")[1]).toBe("0.3");
    expect(show(".5*4=")[1]).toBe("2");
    expect(show("1..5")[1]).toBe("1.5");
    expect(formatNumber(-0)).toBe("0");
  });

  it("shows the last number while the next one is not typed yet", () => {
    expect(show("25*")).toEqual(["25 ×", "25"]);
    expect(show("25*-")).toEqual(["25 −", "25"]);
  });

  it("starts a new sum after =, or goes on from the result with an operator", () => {
    expect(show("2*3=4")).toEqual(["", "4"]);
    expect(show("2*3=+4=")).toEqual(["6 + 4", "10"]);
  });

  it("± changes the sign of the entry or the result", () => {
    expect(show("5±")[1]).toBe("−5");
    expect(show("5±±")[1]).toBe("5");
    expect(show("±7")[1]).toBe("−7");
    expect(show("3*±2=")).toEqual(["3 × −2", "−6"]);
    expect(show("2*3=±")).toEqual(["", "−6"]);
  });

  it("% divides by 100, and after + or − takes that share of what comes before", () => {
    expect(show("50%")[1]).toBe("0.5");
    expect(show("200+10%")[1]).toBe("20");
    expect(show("200+10%=")[1]).toBe("220");
    expect(show("200-25%=")[1]).toBe("150");
    expect(show("80*25%=")[1]).toBe("20");
    expect(show("8=%")[1]).toBe("0.08");
  });

  it("shows an error for a division by zero until the next key", () => {
    const state = press("7/0=");
    expect(calcDisplay(state)).toEqual({ expression: "7 ÷ 0", value: "", error: true });
    expect(calcDisplay(calcReducer(state, "+")).error).toBe(true);
    expect(show("7/0=3")).toEqual(["", "3"]);
  });

  it("C clears everything, and Backspace takes back one character", () => {
    expect(show("12+3C")).toEqual(["", "0"]);
    expect(show("123<")).toEqual(["", "12"]);
    expect(show("-<")).toEqual(["0 −", "0"]);
  });

  it(`takes at most ${CALC_MAX_DIGITS} digits in one number`, () => {
    expect(show("1234567890123456")[1]).toBe("123456789012");
  });

  it("an operator first starts from 0, and a second operator replaces the first", () => {
    expect(show("*5=")[1]).toBe("0");
    expect(show("9+*2=")).toEqual(["9 × 2", "18"]);
    expect(show("9+=")).toEqual(["9", "9"]);
  });

  it("keeps nothing between sessions: the state is a plain value with no history", () => {
    const state = press("2*25/2=");
    expect(Object.keys(state).sort()).toEqual(["done", "entry", "error", "items"]);
    expect(press("C", state)).toEqual(CALC_INITIAL);
  });

  it("maps the keyboard", () => {
    expect(["7", ",", "x", "÷", "Enter", "Escape", "Backspace", "%", "a"].map(keyFromKeyboard)).toEqual([
      "7",
      ".",
      "*",
      "/",
      "=",
      "clear",
      "backspace",
      "percent",
      null,
    ]);
  });
});
