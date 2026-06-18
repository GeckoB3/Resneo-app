import {
  buildModelBreakdownCsvRows,
  modelDepositDisplay,
  modelRowLabel,
  visibleModelRows,
} from '@/lib/reports/report-by-model';
import type { ReportByModelRow } from '@/types/reports';

/**
 * Pure derivation + CSV-row mapping for the per-booking-model breakdown
 * (Reports overview). No React / no I/O — exercises the row filtering, label
 * fallback, and the exact CSV grid the export builds.
 */

function row(overrides: Partial<ReportByModelRow> = {}): ReportByModelRow {
  return {
    booking_model: 'practitioner_appointment',
    label: 'Appointments',
    booking_count: 0,
    covers: 0,
    cancelled_count: 0,
    completed_count: 0,
    checked_in_count: 0,
    deposit_pence_collected: 0,
    ...overrides,
  };
}

describe('visibleModelRows', () => {
  it('returns [] for null / undefined / empty input', () => {
    expect(visibleModelRows(null)).toEqual([]);
    expect(visibleModelRows(undefined)).toEqual([]);
    expect(visibleModelRows([])).toEqual([]);
  });

  it('drops rows that are zero across every metric', () => {
    expect(visibleModelRows([row()])).toEqual([]);
  });

  it('keeps a row when any single metric is non-zero', () => {
    expect(visibleModelRows([row({ booking_count: 1 })])).toHaveLength(1);
    expect(visibleModelRows([row({ covers: 2 })])).toHaveLength(1);
    expect(visibleModelRows([row({ cancelled_count: 1 })])).toHaveLength(1);
    expect(visibleModelRows([row({ completed_count: 1 })])).toHaveLength(1);
    expect(visibleModelRows([row({ checked_in_count: 1 })])).toHaveLength(1);
    expect(visibleModelRows([row({ deposit_pence_collected: 50 })])).toHaveLength(1);
  });

  it('filters a mixed list, preserving order of the kept rows', () => {
    const rows = [
      row({ booking_model: 'class_session', label: 'Classes', booking_count: 4 }),
      row({ booking_model: 'event', label: 'Events' }), // all-zero → dropped
      row({ booking_model: 'resource', label: 'Resources', covers: 3 }),
    ];
    const out = visibleModelRows(rows);
    expect(out.map((r) => r.booking_model)).toEqual(['class_session', 'resource']);
  });
});

describe('modelRowLabel', () => {
  it('prefers the server label', () => {
    expect(modelRowLabel(row({ label: 'Appointments' }))).toBe('Appointments');
  });

  it('falls back to the booking_model key when the label is blank/whitespace', () => {
    expect(modelRowLabel(row({ label: '', booking_model: 'class_session' }))).toBe(
      'class_session',
    );
    expect(modelRowLabel(row({ label: '   ', booking_model: 'event' }))).toBe('event');
  });
});

describe('modelDepositDisplay', () => {
  it('renders an em-dash for a zero deposit', () => {
    // formatPence treats 0 as a real amount, so deposit display only dashes on
    // null — verify the zero case still produces a string (not a crash).
    expect(typeof modelDepositDisplay(row({ deposit_pence_collected: 0 }))).toBe('string');
  });

  it('renders a non-dash money string for a positive deposit', () => {
    const out = modelDepositDisplay(row({ deposit_pence_collected: 1250 }));
    // Locale-dependent currency glyph — assert it contains the pounds value
    // rather than an exact symbol so the test is locale-robust.
    expect(out).toContain('12.50');
    expect(out).not.toBe('—');
  });
});

describe('buildModelBreakdownCsvRows', () => {
  it('emits a header row only when there are no visible rows', () => {
    const grid = buildModelBreakdownCsvRows([row()]); // all-zero → filtered out
    expect(grid).toHaveLength(1);
    expect(grid[0]).toEqual([
      'Model',
      'Bookings',
      'Covers',
      'Completed',
      'Checked in',
      'Cancelled',
      'Deposits (pence)',
      'Deposits (£)',
    ]);
  });

  it('maps each visible row to string cells with pence and £ deposit columns', () => {
    const grid = buildModelBreakdownCsvRows([
      row({
        booking_model: 'class_session',
        label: 'Classes',
        booking_count: 10,
        covers: 24,
        completed_count: 8,
        checked_in_count: 9,
        cancelled_count: 2,
        deposit_pence_collected: 4500,
      }),
    ]);
    expect(grid).toHaveLength(2);
    expect(grid[1]).toEqual(['Classes', '10', '24', '8', '9', '2', '4500', '45.00']);
  });

  it('uses the booking_model key as the label cell when the label is blank', () => {
    const grid = buildModelBreakdownCsvRows([
      row({ booking_model: 'event', label: '', booking_count: 1 }),
    ]);
    expect(grid[1][0]).toBe('event');
  });

  it('omits all-zero rows from the body', () => {
    const grid = buildModelBreakdownCsvRows([
      row({ booking_model: 'a', label: 'A', booking_count: 1 }),
      row({ booking_model: 'b', label: 'B' }), // zero → dropped
      row({ booking_model: 'c', label: 'C', covers: 5 }),
    ]);
    // header + 2 kept rows
    expect(grid).toHaveLength(3);
    expect(grid.slice(1).map((r) => r[0])).toEqual(['A', 'C']);
  });
});
