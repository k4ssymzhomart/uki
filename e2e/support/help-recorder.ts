// The Requests button of 2.4d in a page: a MutationObserver stamps every change of its count
// (`data-help-count`, or the button going away) with the page clock, so a test can time a help request
// from its `at` to the proctor's screen. Used by e2e/help.spec.ts and the load test.
import { expect, type Page } from "@playwright/test";

export interface BadgeChange {
  /** Page Date.now() when the Requests button's count changed. */
  t: number;
  count: number;
}

/** Stamps every change of the Requests count (data-help-count, or the button going away) in the page. */
export async function installBadgeRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = window as unknown as { __ukiHelp?: BadgeChange[] };
    if (host.__ukiHelp) return;
    const log: BadgeChange[] = [];
    host.__ukiHelp = log;
    const read = () => {
      const button = document.querySelector("[data-help-count]");
      return button === null ? 0 : Number(button.getAttribute("data-help-count"));
    };
    let last = read();
    new MutationObserver(() => {
      const count = read();
      if (count === last) return;
      last = count;
      log.push({ t: Date.now(), count });
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-help-count"],
    });
  });
}

/** How many badge changes the page has logged so far: a mark to wait from. */
export async function badgeMark(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __ukiHelp?: BadgeChange[] }).__ukiHelp?.length ?? 0);
}

/** The page time of the first change logged after `mark` that set the count to `count`. */
export async function badgeReached(page: Page, count: number, mark: number): Promise<number> {
  let found: number | undefined;
  await expect
    .poll(
      async () => {
        const log = await page.evaluate(
          () => (window as unknown as { __ukiHelp?: BadgeChange[] }).__ukiHelp ?? [],
        );
        found = log.slice(mark).find((change) => change.count === count)?.t;
        return found !== undefined;
      },
      { timeout: 15_000, intervals: [100] },
    )
    .toBe(true);
  return found ?? Number.NaN;
}
