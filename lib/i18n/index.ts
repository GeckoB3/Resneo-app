/**
 * Lightweight, dependency-free i18n layer (localization readiness, W6.4).
 *
 * Provides a typed `t(key, params?)` lookup over the EN string catalogue
 * (`strings.ts`) with `{param}` interpolation, plus locale resolution from the
 * device via `expo-localization`. There is intentionally NO i18next here — for
 * an EN-only app the goal is *readiness*: a tiny typed function so that adding a
 * locale later is a catalogue + registry change, not a string re-extraction or
 * a new dependency.
 *
 * Adding a locale (fr/es/…):
 *   1. Copy the `en` object in `strings.ts`, translate the leaf strings, and
 *      give it a `LocaleFormatConfig` (formatLocale + currency).
 *   2. Register it in `CATALOGUES` below, keyed by language code.
 *   3. Done — `t()` and `lib/format.ts` follow the active locale automatically.
 *
 * Locale is resolved ONCE (the first lookup) and memoized: `getLocales()` is a
 * native bridge call, and the active locale does not change within a session.
 */

import { getLocales } from 'expo-localization';

import { en, enFormat, type LocaleFormatConfig, type Strings } from './strings';

/** A registered locale: its catalogue (must match the EN shape) + format config. */
interface LocaleCatalogue {
  strings: Strings;
  format: LocaleFormatConfig;
}

/**
 * Registered locales, keyed by lowercase language code (`languageCode` from
 * `getLocales()`, e.g. 'en'). EN is the default and the fallback. Future
 * locales slot in here with no other code change.
 */
const CATALOGUES: Record<string, LocaleCatalogue> = {
  en: { strings: en, format: enFormat },
};

/** The language we fall back to when the device locale has no catalogue. */
const FALLBACK_LANGUAGE = 'en';

/** BCP-47 tag used when the device reports nothing usable. */
const FALLBACK_LANGUAGE_TAG = 'en-GB';

interface ResolvedLocale {
  /** Catalogue chosen for the active locale (always a registered one). */
  catalogue: LocaleCatalogue;
  /** Device BCP-47 tag (e.g. 'en-GB'), or the fallback tag. */
  languageTag: string;
}

let cached: ResolvedLocale | null = null;

/**
 * Resolve the device locale to a registered catalogue, memoized.
 *
 * Reads the first entry of `getLocales()` (the device's preferred locale) and
 * matches its `languageCode` to a registered catalogue, defaulting to EN. Any
 * failure (native module unavailable, empty list) falls back to EN / en-GB so
 * the app — and `lib/format.ts` — behave exactly as before i18n existed.
 */
function resolve(): ResolvedLocale {
  if (cached) return cached;

  let languageTag = FALLBACK_LANGUAGE_TAG;
  let language = FALLBACK_LANGUAGE;
  try {
    const locales = getLocales();
    const primary = locales[0];
    if (primary?.languageTag) languageTag = primary.languageTag;
    if (primary?.languageCode) language = primary.languageCode.toLowerCase();
  } catch {
    // Native module unavailable (e.g. tests without a mock) — keep the fallback.
  }

  const catalogue = CATALOGUES[language] ?? CATALOGUES[FALLBACK_LANGUAGE]!;
  cached = { catalogue, languageTag };
  return cached;
}

/**
 * Clear the memoized locale. For tests that re-mock `getLocales()` between
 * cases; not used in app code (the locale is fixed for a session).
 */
export function resetLocaleCache(): void {
  cached = null;
}

/** Active device BCP-47 tag (e.g. 'en-GB'), or the fallback when unavailable. */
export function getActiveLocale(): string {
  return resolve().languageTag;
}

/**
 * Money/number/date formatting config for the active locale (formatLocale +
 * currency). `lib/format.ts` reads this so a locale change flows through to
 * currency and number formatting. Defaults to en-GB / GBP.
 */
export function getActiveFormatConfig(): LocaleFormatConfig {
  return resolve().catalogue.format;
}

// --- Typed key paths -------------------------------------------------------

/** Recursively builds the union of dotted leaf paths of the catalogue, e.g.
 *  'common.save' | 'account.profile.title' | … (string leaves only). */
type Leaves<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends Record<string, unknown>
      ? `${K}.${Leaves<T[K]>}`
      : never;
}[keyof T & string];

/** Every valid key accepted by {@link t}. */
export type TranslationKey = Leaves<Strings>;

/** Values interpolated into `{param}` placeholders. */
export type TranslationParams = Record<string, string | number>;

/** Walk a dotted path into the catalogue; returns the string or undefined. */
function lookup(strings: Strings, key: string): string | undefined {
  let node: unknown = strings;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Replace `{name}` placeholders with the matching param (missing → left as-is). */
function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Translate a catalogue key for the active locale, with `{param}`
 * interpolation. The key is type-checked against the EN catalogue.
 *
 * Resolution order: active-locale catalogue → EN fallback → the raw key
 * (so a missing translation degrades to a visible, debuggable token rather
 * than throwing).
 *
 * @example t('common.save')                       // "Save"
 * @example t('account.profile.title')             // "Your profile"
 */
export function t(key: TranslationKey, params?: TranslationParams): string {
  const { catalogue } = resolve();
  const value = lookup(catalogue.strings, key) ?? lookup(en, key) ?? key;
  return interpolate(value, params);
}
