import { BCP47, isLocale } from "@uki/i18n";
import { useEffect, useState } from "react";
import { LockIntlProvider } from "../../lib/intl.tsx";
import { hostParam } from "../../lib/rules.ts";
import { BarState, EMPTY_VIEW, LockView, STORAGE_KEYS } from "../../lib/state.ts";
import { useStored } from "../../lib/use-stored.ts";
import { BlockedPage } from "./blocked-page.tsx";

/** Back to the exam: the page before the blocked load, or the portal when there is none. */
function goBack(bar: BarState | null): void {
  if (window.history.length > 1) window.history.back();
  else if (bar?.lms_url) window.location.assign(bar.lms_url);
}

export function BlockedRoot() {
  const bar = useStored(STORAGE_KEYS.bar, BarState.nullable(), null);
  const view = useStored(STORAGE_KEYS.view, LockView, EMPTY_VIEW);
  const [host] = useState(() => hostParam(window.location.search));
  const [attemptAt] = useState(() => Date.now());
  const candidate = bar?.locale ?? view.exam_state?.locale;
  const locale = isLocale(candidate) ? candidate : "kk";
  useEffect(() => {
    document.documentElement.lang = BCP47[locale];
  }, [locale]);
  return (
    <LockIntlProvider locale={locale}>
      <BlockedPage bar={bar} host={host} attemptAt={attemptAt} locale={locale} onBack={() => goBack(bar)} />
    </LockIntlProvider>
  );
}
