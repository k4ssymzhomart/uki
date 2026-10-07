import { render, screen } from "@testing-library/react";
import { BCP47, TIME_ZONE } from "@uki/i18n";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { PagePlaceholder } from "../components/page-placeholder.tsx";
import requestConfig, { DASHBOARD_LOCALE } from "../i18n/request.ts";

vi.mock("next-intl/server", () => ({
  getRequestConfig: (factory: () => unknown) => factory,
}));

function LanguageLabel() {
  const t = useTranslations("language");
  return <p>{t("en")}</p>;
}

describe("web skeleton", () => {
  it("serves English dashboard messages in Asia/Almaty", async () => {
    const config = await (requestConfig as unknown as () => Promise<Record<string, unknown>>)();
    expect(DASHBOARD_LOCALE).toBe("en");
    expect(config.locale).toBe(BCP47.en);
    expect(config.timeZone).toBe(TIME_ZONE);
    expect(config.messages).toHaveProperty("language.en", "ENG");
  });

  it("renders a placeholder page and a message through next-intl", async () => {
    const config = await (requestConfig as unknown as () => Promise<{ messages: Record<string, unknown> }>)();
    render(
      <NextIntlClientProvider locale={BCP47.en} messages={config.messages} timeZone={TIME_ZONE}>
        <PagePlaceholder frame="A.0" />
        <LanguageLabel />
      </NextIntlClientProvider>,
    );
    expect(document.querySelector('[data-placeholder="A.0"] img')).not.toBeNull();
    expect(screen.getByText("ENG")).toBeTruthy();
  });
});
