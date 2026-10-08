# @uki/i18n

Student app and Üki Lock strings in Kazakh, Russian and English, plus the dashboard strings in English and Russian.

## Files

| File | What it is |
| --- | --- |
| `catalog.json` | Every student and Üki Lock string: key, group, source, en, kk, ru, notes. Edit this one. |
| `dashboard.json`, `dashboard-<part>.json` | The dashboard strings, one file per dashboard area (`dashboard-wall.json`, `dashboard-landing.json`, ...). Each is a flat map of `dashboard.*` key to `{ "en": "...", "ru": "..." }`, English from the Figma frames. A file may start with a `"$comment"` string for notes about the whole file; it is not a message. Keys use dot-separated segments of `[a-z0-9][a-zA-Z0-9_]*`, and no key may appear in two files. Add new keys in your own sorted block or your own file, so parallel branches rebase cleanly. |
| `messages/{en,kk,ru}.json` | Generated nested messages. Commit them; apps import them. `en.json` and `ru.json` also hold the `dashboard` namespace; Kazakh has none and falls back to English in `loadMessages`. |
| `src/kk-intl/kk-data.json` | Generated Kazakh number and date data plus the Asia/Almaty time zone for the Intl polyfill, from the installed `@formatjs` packages: `pnpm --filter @uki/i18n kk-intl-data`. A unit test fails when it is out of date. |

`pnpm i18n:build` regenerates `messages/` and fails, writing nothing, on: a missing or empty message (a dashboard message needs both `en` and `ru`), an ICU parse error, a plural without `other` or with an arm the language does not have, argument names that differ between en, kk and ru (en and ru for the dashboard), a key that is both a message and a namespace, a dashboard key defined in two files, a bad rename, and a count message whose en or ru text has no plural block. `pnpm --filter @uki/i18n build:check` only checks that `messages/` is up to date.

## Use

```ts
import { createUkiTranslator, formatTime, formatDate, LOCALES, LOCALE_LABELS } from "@uki/i18n";

const t = createUkiTranslator("kk");
t("exam.saved", { time: formatTime(savedAt, "kk", { seconds: true }) });
t("done.submitted.value", { time: formatTime(at, "kk"), date: formatDate(at, "kk") });
```

React (desktop renderer, Lock popup) with use-intl, and the web dashboard with next-intl:

```tsx
import { BCP47, formats, loadMessages, TIME_ZONE } from "@uki/i18n";

<IntlProvider locale={BCP47[locale]} messages={loadMessages(locale)} timeZone={TIME_ZONE} formats={formats}>
```

## Kazakh in Electron and Chrome

Electron 44 (Chrome 152) and Chromium ship ICU without Kazakh data: they accept `kk-KZ` but print 0.94 as "0.94" and 9 October as "M10 9, Fri". `@uki/i18n/polyfill` fixes that. Import it first, before anything creates a formatter:

```ts
// apps/desktop/src/renderer/main.tsx, and each Üki Lock entry (popup, blocked page, lock-guard content script)
import "@uki/i18n/polyfill";
```

It probes the runtime (a decimal comma, a Kazakh month name, the Kazakh plural "one") and, for each of `Intl.NumberFormat`, `Intl.DateTimeFormat` and `Intl.PluralRules` that fails, installs a router: Kazakh goes to the FormatJS polyfill with `src/kk-intl/kk-data.json`, Russian and English stay native. `Number.prototype.toLocaleString` and `Date.prototype.toLocale*String` follow. Nothing changes in Node or in a browser with full ICU. Chromium and Electron format Kazakh plurals natively, so only numbers and dates are routed there. The polyfill and its data are about 244 KB minified.

`pnpm --filter @uki/i18n test:browser` runs it in Playwright's Chromium and prints what Chromium formats before and after.

## Type-safe keys

`createUkiTranslator` is typed without any setup. For `useTranslations` and friends, opt in once per app with a `.d.ts` file that the app's tsconfig includes:

```ts
// apps/desktop/src/renderer/i18n.d.ts, apps/lock/i18n.d.ts, apps/web/i18n.d.ts
import type {} from "@uki/i18n/app-config";
```

That augments use-intl's `AppConfig` with `Messages` (from `messages/en.json`) and `Formats`. next-intl reads the same `AppConfig`; if a separate copy of use-intl ever breaks that, augment `next-intl` instead, as `src/app-config.d.ts` shows.

## Dashboard Russian

The Russian dashboard strings are a first pass by the agent (WP 1.2), marked in each file's `$comment`; the native read-through is P.18. Write Russian plurals with `one`, `few`, `many` and `other`.

```json
{
  "$comment": "Native review needed, P.18.",
  "dashboard.review.title": { "en": "Review", "ru": "Проверка" },
  "dashboard.review.flags": {
    "en": "{count, plural, one {# flag} other {# flags}}",
    "ru": "{count, plural, one {# отметка} few {# отметки} many {# отметок} other {# отметки}}"
  }
}
```
