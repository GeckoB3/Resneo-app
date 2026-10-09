/**
 * Dates for the stock reports' period (web `StockReportsTab.tsx`): today on the venue's clock, and
 * the default period of the last thirty days ending today.
 */

const DAY = 86_400_000;

/** Today as YYYY-MM-DD in the venue's time zone. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const y = get('year');
    const m = get('month');
    const d = get('day');
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Fall back to UTC.
  }
  return now.toISOString().slice(0, 10);
}

export function minusDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T12:00:00Z`) - days * DAY).toISOString().slice(0, 10);
}

/** A YYYY-MM-DD as a local noon Date, for the date picker's limits. */
export function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1, 12);
}

/** "9 Oct" for a YYYY-MM-DD, as the web's short till date. */
export function shortYmd(ymd: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));
  } catch {
    return ymd;
  }
}
