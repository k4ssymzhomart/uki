import { describe, expect, it } from "vitest";
import {
  BLOCKED_PAGE,
  blockedHostFromUrl,
  buildRedirectRule,
  isBlockedPageUrl,
  lockRulesUpdate,
  REDIRECT_RULE_ID,
  releaseRulesUpdate,
} from "./rules.ts";

const ID = "abcdefghijklmnopabcdefghijklmnop";

describe("the redirect rule", () => {
  it("matches the plan: main frames outside the allowed hosts go to blocked.html?host=", () => {
    expect(buildRedirectRule(["localhost:5180", "wikipedia.org"], ID)).toEqual({
      id: REDIRECT_RULE_ID,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { regexSubstitution: `chrome-extension://${ID}/blocked.html?host=\\1` },
      },
      condition: {
        regexFilter: "^https?://([^/:?#]+).*$",
        resourceTypes: ["main_frame"],
        excludedRequestDomains: ["localhost", "wikipedia.org"],
      },
    });
  });

  it("replaces the whole URL, as Chrome substitutes only the matched part", () => {
    const rule = buildRedirectRule([], ID);
    const url = "https://en.wikipedia.org:443/wiki/X?y=1#top";
    // What Chrome does: the first match of regexFilter is replaced with the substitution.
    const redirected = url.replace(
      new RegExp(rule.condition.regexFilter),
      rule.action.redirect.regexSubstitution.replace("\\1", "$1"),
    );
    expect(redirected).toBe(`chrome-extension://${ID}/${BLOCKED_PAGE}?host=en.wikipedia.org`);
  });

  it("leaves excludedRequestDomains out when nothing is allowed (exams in the app)", () => {
    expect("excludedRequestDomains" in buildRedirectRule([], ID).condition).toBe(false);
  });

  it("always removes its own id before adding, so a restart never duplicates it", () => {
    expect(lockRulesUpdate(["exam.kru.test"], ID)).toMatchObject({
      removeRuleIds: [REDIRECT_RULE_ID],
      addRules: [{ id: REDIRECT_RULE_ID }],
    });
    expect(releaseRulesUpdate()).toEqual({ removeRuleIds: [REDIRECT_RULE_ID] });
  });

  it("reads the host back from the block page's URL", () => {
    expect(blockedHostFromUrl(`chrome-extension://${ID}/blocked.html?host=Wikipedia.org`, ID)).toBe(
      "wikipedia.org",
    );
    expect(blockedHostFromUrl(`chrome-extension://${ID}/blocked.html`, ID)).toBeNull();
    expect(
      blockedHostFromUrl(`chrome-extension://${ID}/blocked.html?host=127.0.0.1:5181/physics-1/quiz-3`, ID),
    ).toBe("127.0.0.1");
    expect(blockedHostFromUrl(`chrome-extension://other/blocked.html?host=x.org`, ID)).toBeNull();
    expect(blockedHostFromUrl("https://wikipedia.org/?host=x", ID)).toBeNull();
    expect(isBlockedPageUrl(`chrome-extension://${ID}/blocked.html?host=a.b`, ID)).toBe(true);
    expect(isBlockedPageUrl("https://a.b/blocked.html", ID)).toBe(false);
  });
});
