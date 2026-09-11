/**
 * A contact's display name — port of the web `src/lib/guests/name.ts`, so a
 * name the app puts in a message summary reads exactly as the dashboard's.
 */

/** Trim and collapse internal whitespace; empty becomes null. */
export function normaliseGuestNamePart(value: string | null | undefined): string | null {
  const trimmed = value?.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed : null;
}

/** "First Last", one part when only one is known, else the fallback word. */
export function formatGuestDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback: 'guest' | 'walk-in' = 'guest',
): string {
  const first = normaliseGuestNamePart(firstName);
  const last = normaliseGuestNamePart(lastName);
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return fallback === 'walk-in' ? 'Walk-in' : 'Guest';
}
