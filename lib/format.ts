/**
 * Shared formatting — the ONE place money/duration strings come from.
 * (Five screens previously carried their own copies.)
 */

/** "£12.50" from pence; null/undefined → null so callers can hide the row. */
export function formatPence(pence: number | null | undefined): string | null {
  if (pence == null) return null;
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
      pence / 100,
    );
  } catch {
    return `£${(pence / 100).toFixed(2)}`;
  }
}

/** Like {@link formatPence} but treats 0/negative as "no amount". */
export function formatPositivePence(pence: number | null | undefined): string | null {
  if (pence == null || pence <= 0) return null;
  return formatPence(pence);
}

/**
 * Parse a user-typed pounds amount ("12.50", "£12.50", "") to pence.
 * Empty → null (clear); invalid → undefined (caller shows a validation error).
 */
export function parsePoundsToPence(value: string): number | null | undefined {
  const trimmed = value.trim().replace('£', '');
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

/** Pence → "12.50" for seeding a text input ("" when absent). */
export function penceToPoundsInput(pence: number | null | undefined): string {
  if (pence == null) return '';
  return (pence / 100).toFixed(2);
}

/** "1h 30m" / "45m" from minutes. */
export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}
