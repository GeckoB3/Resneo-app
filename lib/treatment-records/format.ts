/**
 * Dates and times for treatment records, in the venue's time zone (web plan Appendix A:
 * "22 Oct 2026 at 14:32"). The same rules as the web's `treatment-records/format.ts`.
 */

function safeZone(timeZone: string | null | undefined): string {
  return timeZone && timeZone.trim() ? timeZone : 'Europe/London';
}

export function formatDay(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: safeZone(timeZone), day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function formatTime(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: safeZone(timeZone), hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/** A date with no time, such as an expiry date (`2027-03-31` → `31 Mar 2027`). No time zone applies. */
export function formatYmd(ymd: string | null | undefined): string {
  const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  if (!m) return ymd ?? '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/** YYYY-MM-DD of an instant in the venue's zone. */
export function ymdIn(iso: string | Date, timeZone?: string | null): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: safeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** True when a YYYY-MM-DD date is before today in the venue's zone (an expired product). */
export function isPastDay(ymd: string | null | undefined, timeZone?: string | null): boolean {
  if (!ymd) return false;
  return ymd < ymdIn(new Date(), timeZone);
}
