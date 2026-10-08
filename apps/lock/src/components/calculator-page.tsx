import { BCP47, type Locale } from "@uki/i18n";
import { Avatar, cn, icons, initials, LockCalculator } from "@uki/ui";
import { useEffect, useReducer, useRef } from "react";
import { useTranslations } from "use-intl";
import { CALC_INITIAL, calcDisplay, calcReducer, keyFromKeyboard } from "../lib/calculator.ts";

/** A value longer than this steps down a size so it fits E.5b's display. */
const COMPACT_FROM = 11;

export interface CalculatorPageProps {
  /** The student's name for the header, from the app's hello; the header leaves it out when unknown. */
  studentName: string | null;
  locale: Locale;
  className?: string;
}

/**
 * E.5b's calculator page (Figma 153:11727): the header "Calculator · built into Üki Lock" with the student,
 * and the calculator card. The state lives only in this component: nothing is stored or sent, and leaving
 * the Calculator tab unmounts it, which clears it. Keys work from the keyboard too.
 */
export function CalculatorPage({ studentName, locale, className }: CalculatorPageProps) {
  const t = useTranslations();
  const [state, press] = useReducer(calcReducer, CALC_INITIAL);
  const display = calcDisplay(state);
  const ref = useRef<HTMLElement>(null);
  const Calculator = icons.calculator;

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label={t("lock.tab.calculator")}
      data-uki-calculator=""
      className={cn("flex flex-col bg-canvas text-fg-primary outline-none", className)}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const key = keyFromKeyboard(event.key);
        if (key === null) return;
        // The calculator's own keys: the exam page under it never sees them.
        event.preventDefault();
        event.stopPropagation();
        press(key);
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line-default bg-surface pr-6 pl-7">
        <Calculator aria-hidden="true" className="size-4.5 shrink-0 text-icon-primary" />
        <h1 className="type-label-m whitespace-nowrap">{t("lock.calc.title")}</h1>
        <div className="min-w-0 flex-1" />
        {studentName ? (
          <>
            <span className="type-ui-label whitespace-nowrap opacity-70">{studentName}</span>
            <Avatar tone="paper" initials={initials(studentName, BCP47[locale])} />
          </>
        ) : null}
      </header>
      <div className="flex justify-center px-6 pt-10 pb-10">
        <LockCalculator
          expression={display.expression}
          value={display.error ? t("lock.calc.error") : display.value}
          error={display.error}
          compact={display.value.length >= COMPACT_FROM}
          clearLabel={t("lock.calc.clear")}
          note={t("lock.calc.note")}
          onKey={press}
        />
      </div>
    </section>
  );
}
