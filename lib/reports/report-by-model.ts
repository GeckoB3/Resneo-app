/**
 * Per-booking-model breakdown helpers for the Reports overview.
 *
 * The reports payload carries `report_by_booking_model` (one row per active
 * booking model with booking_count / covers / cancelled / completed /
 * checked-in / deposit collected). The web uses it for the full export's
 * per-model breakdown; the app surfaces a compact summary for multi-model
 * venues plus a CSV export. These helpers are the pure, testable core:
 * row filtering and the CSV grid mapping. No React, no I/O.
 *
 * @see types/reports.ts (`ReportByModelRow`)
 * @see _reference/Resneo/src/app/api/venue/reports/route.ts (`report_by_booking_model`)
 */
import { formatPence } from '@/lib/format';
import type { ReportByModelRow } from '@/types/reports';

/** A money cell that never collapses to an em-dash inside a CSV. */
function poundsCell(pence: number): string {
  return (pence / 100).toFixed(2);
}

/**
 * Keep only rows worth showing: a model with zero of everything is noise.
 * Mirrors the web, which omits all-zero model rows from the breakdown.
 */
export function visibleModelRows(
  rows: ReportByModelRow[] | null | undefined,
): ReportByModelRow[] {
  if (!rows?.length) return [];
  return rows.filter(
    (r) =>
      r.booking_count > 0 ||
      r.covers > 0 ||
      r.cancelled_count > 0 ||
      r.completed_count > 0 ||
      r.checked_in_count > 0 ||
      r.deposit_pence_collected > 0,
  );
}

/** Display label for a model row — prefer the server label, fall back to the key. */
export function modelRowLabel(row: ReportByModelRow): string {
  const label = row.label?.trim();
  return label && label.length > 0 ? label : row.booking_model;
}

/** Human money string for the UI (em-dash when null/0 via `formatPence`). */
export function modelDepositDisplay(row: ReportByModelRow): string {
  return formatPence(row.deposit_pence_collected) ?? '—';
}

/**
 * Build the CSV grid (header + one row per *visible* model) for the per-model
 * breakdown export. Pairs with `buildAndShareCsv`. Pure — returns string cells
 * only, so it is unit-testable without the share/file layer.
 */
export function buildModelBreakdownCsvRows(
  rows: ReportByModelRow[] | null | undefined,
): string[][] {
  const header = [
    'Model',
    'Bookings',
    'Covers',
    'Completed',
    'Checked in',
    'Cancelled',
    'Deposits (pence)',
    'Deposits (£)',
  ];
  const body = visibleModelRows(rows).map((row) => [
    modelRowLabel(row),
    String(row.booking_count),
    String(row.covers),
    String(row.completed_count),
    String(row.checked_in_count),
    String(row.cancelled_count),
    String(row.deposit_pence_collected),
    poundsCell(row.deposit_pence_collected),
  ]);
  return [header, ...body];
}
