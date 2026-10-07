import { BCP47, formats, TIME_ZONE } from "@uki/i18n";
import { describe, expect, it, vi } from "vitest";
import requestConfig, { DASHBOARD_LOCALE } from "./request.ts";

// getRequestConfig hands back the factory, so the test calls it as next-intl would for a request.
vi.mock("next-intl/server", () => ({
  getRequestConfig: (factory: () => unknown) => factory,
}));

type Config = { locale: string; messages: Record<string, unknown>; timeZone: string; formats: unknown };

describe("the dashboard's next-intl request config", () => {
  it("serves the English dashboard messages in Asia/Almaty", async () => {
    const config = await (requestConfig as unknown as () => Promise<Config>)();
    expect(DASHBOARD_LOCALE).toBe("en");
    expect(config.locale).toBe(BCP47.en);
    expect(config.timeZone).toBe("Asia/Almaty");
    expect(config.timeZone).toBe(TIME_ZONE);
    expect(config.formats).toBe(formats);
    expect(config.messages).toHaveProperty("language.en", "ENG");
    expect(config.messages).toHaveProperty("dashboard.signIn.submit", "Sign in");
    expect(config.messages).toHaveProperty("dashboard.shell.lookupFailed.retry", "Try again");
  });
});
