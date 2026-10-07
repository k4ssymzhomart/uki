# @uki/i18n

Student app and Üki Lock strings in Kazakh, Russian and English, plus the English-only dashboard strings.

## Files

| File | What it is |
| --- | --- |
| `catalog.json` | Every student and Üki Lock string: key, group, source, en, kk, ru, notes. Edit this one. |
| `dashboard.json` | Flat map of `dashboard.*` key to English text, taken from the Figma dashboard frames (A.0, 0.1, 1.5, 2.4, 2.5). Starts as `{}`; the web dashboard fills it. Keys use dot-separated segments of `[a-z0-9][a-zA-Z0-9_]*`. English only in Phase 0. |
| `messages/{en,kk,ru}.json` | Generated nested messages. Commit them; apps import them. `en.json` also holds the `dashboard` namespace. |

`pnpm i18n:build` regenerates `messages/` and fails, writing nothing, on: a missing or empty message, an ICU parse error, a plural without `other` or with an arm the language does not have, argument names that differ between en, kk and ru, a key that is both a message and a namespace, a bad rename, and a count message whose en or ru text has no plural block. `pnpm --filter @uki/i18n build:check` only checks that `messages/` is up to date.

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

## Type-safe keys

`createUkiTranslator` is typed without any setup. For `useTranslations` and friends, opt in once per app with a `.d.ts` file that the app's tsconfig includes:

```ts
// apps/desktop/src/renderer/i18n.d.ts, apps/lock/i18n.d.ts, apps/web/i18n.d.ts
import type {} from "@uki/i18n/app-config";
```

That augments use-intl's `AppConfig` with `Messages` (from `messages/en.json`) and `Formats`. next-intl reads the same `AppConfig`; if a separate copy of use-intl ever breaks that, augment `next-intl` instead, as `src/app-config.d.ts` shows.
