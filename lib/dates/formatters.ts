/**
 * Cached `Intl.DateTimeFormat` instances.
 *
 * Constructing a `DateTimeFormat` is the expensive part — it resolves the locale
 * and, when a `timeZone` is given, loads that zone's rules. Formatting with an
 * existing instance is cheap. Hermes makes the gap wide enough to matter: the
 * app builds these in render bodies and per-row helpers (`calendarDateInTimeZone`
 * alone has 27 call sites), so the same handful of formatters were being rebuilt
 * on every render and every list item.
 *
 * A venue has one timezone and the app has one locale, so the cache is a few
 * entries that live for the session — there is nothing to evict.
 *
 * The key must cover every option that changes the output, so it is derived from
 * the options object itself rather than a hand-written subset that would silently
 * collide the day someone adds a field.
 */

const cache = new Map<string, Intl.DateTimeFormat>();

/**
 * A `DateTimeFormat` for these options, reused across calls.
 *
 * Treat the returned instance as shared and immutable — never mutate it, and do
 * not hold it across a locale change (there is none in-app today).
 */
export function getDateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  // Option order is stable per call site (object literals in source), so a plain
  // stringify is a sound key and far cheaper than the constructor it saves.
  const key = `${locale}|${JSON.stringify(options)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const formatter = new Intl.DateTimeFormat(locale, options);
  cache.set(key, formatter);
  return formatter;
}

/** Clear the cache. Tests only — nothing in the app changes locale at runtime. */
export function __clearDateTimeFormatCache(): void {
  cache.clear();
}
