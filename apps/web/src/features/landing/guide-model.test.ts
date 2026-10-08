import { describe, expect, it } from "vitest";
import { GUIDE_STEPS } from "./guide-model.ts";
import { SECTION, sectionHref } from "./landing-model.ts";

describe("the jury guide", () => {
  it("has five numbered steps, in the order the user gave them", () => {
    expect(GUIDE_STEPS.map((step) => step.id)).toEqual(["what", "signIn", "app", "lock", "look"]);
  });

  it("sends the second step to the Live demo and the app and Üki Lock to the download block", () => {
    const actions = Object.fromEntries(
      GUIDE_STEPS.flatMap((step) => ("action" in step ? [[step.id, step.action.href]] : [])),
    );
    expect(actions).toEqual({
      signIn: "/sign-in?email=judge%40kru.test&next=/demo/live",
      app: sectionHref(SECTION.download),
      lock: sectionHref(SECTION.download),
    });
  });
});
