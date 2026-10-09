/**
 * Reviewed value maps on the Review step: a column's own codes (CXL, NS, DNA) to ResNeo's
 * values for booking and deposit status. Port of the web's `VALUE_MAP_TARGETS` and the
 * Review step's save rule (`src/lib/import/value-map.ts`, `ReviewStepClient.saveValueMap`).
 */
import type { MappingRow } from '@/lib/import/types';

export const VALUE_MAP_TARGETS: Record<string, { label: string; canonical: readonly string[] }> = {
  status: {
    label: 'Booking status',
    canonical: ['Booked', 'Pending', 'Confirmed', 'Cancelled', 'No-Show', 'Completed', 'Seated'],
  },
  deposit_status: {
    label: 'Deposit status',
    canonical: ['Not Required', 'Pending', 'Paid', 'Refunded', 'Forfeited', 'Waived'],
  },
};

export type ValueMapEntry = { from: string; to: string };

export function isValueMapTarget(field: string | null | undefined): boolean {
  return Boolean(field && Object.prototype.hasOwnProperty.call(VALUE_MAP_TARGETS, field));
}

export function canonicalValuesForTarget(field: string | null | undefined): readonly string[] {
  return field ? (VALUE_MAP_TARGETS[field]?.canonical ?? []) : [];
}

/** The saved map as editable rows. */
export function valueMapRows(mapping: Pick<MappingRow, 'value_map'>): ValueMapEntry[] {
  return Object.entries(mapping.value_map ?? {}).map(([from, to]) => ({ from, to }));
}

/**
 * Rows to the `value_map` the server takes: blank values dropped, keys trimmed, the last row
 * for a value wins, and null when nothing is left.
 */
export function valueMapFromRows(rows: ValueMapEntry[]): Record<string, string> | null {
  const map: Record<string, string> = {};
  for (const r of rows) {
    const from = r.from.trim();
    if (!from || !r.to) continue;
    map[from] = r.to;
  }
  return Object.keys(map).length ? map : null;
}
