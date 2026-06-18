/**
 * LinkAuditView — audit date-range → query mapping (Domain 16, Low).
 *
 * Unit-tests the pure `auditRangeToQuery` helper that backs the custom From/To
 * range added for web parity. The hook (`useLinkedVenueAudit`) already forwards
 * both `from` and `to`; this confirms the mapping:
 *   • presets set only `from` (an open-ended `to`), `all` clears both;
 *   • `custom` forwards both bounds verbatim;
 *   • an inverted custom window (from > to) drops both so it queries nothing
 *     rather than an inside-out range.
 *
 * Imports only the helper, but `LinkAuditView.tsx` transitively pulls in
 * `DatePickerField`, which loads the native datetimepicker at module scope — so
 * we stub it to a host string (mirrors ResourceExceptionsEditor.test.tsx).
 * Reanimated is already mocked in jest.setup.js.
 */
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

import { auditRangeToQuery } from '@/components/linked/LinkAuditView';

/** Local copy of the helper's preset math, to assert exact `from` boundaries. */
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

describe('auditRangeToQuery', () => {
  it('maps "all" to no bounds', () => {
    expect(auditRangeToQuery('all', '', '')).toEqual({ from: null, to: null });
  });

  it('maps a day preset to a `from` boundary with an open `to`', () => {
    const r30 = auditRangeToQuery('30', '', '');
    expect(r30.to).toBeNull();
    expect(r30.from).toMatch(DATE_RE);
    expect(r30.from).toBe(isoDaysAgo(30));

    const r7 = auditRangeToQuery('7', '', '');
    expect(r7).toEqual({ from: isoDaysAgo(7), to: null });
  });

  it('ignores the custom bounds for a preset range', () => {
    // Custom values must not leak into a preset selection.
    expect(auditRangeToQuery('90', '2026-01-01', '2026-02-01')).toEqual({
      from: isoDaysAgo(90),
      to: null,
    });
  });

  it('forwards both bounds for a custom range', () => {
    expect(auditRangeToQuery('custom', '2026-01-01', '2026-03-31')).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    });
  });

  it('allows an open-ended custom range (only one bound set)', () => {
    expect(auditRangeToQuery('custom', '2026-01-01', '')).toEqual({ from: '2026-01-01', to: null });
    expect(auditRangeToQuery('custom', '', '2026-03-31')).toEqual({ from: null, to: '2026-03-31' });
  });

  it('drops an inverted custom window (from after to) so it queries nothing', () => {
    expect(auditRangeToQuery('custom', '2026-03-31', '2026-01-01')).toEqual({
      from: null,
      to: null,
    });
  });

  it('treats equal from/to as a single-day window (not inverted)', () => {
    expect(auditRangeToQuery('custom', '2026-02-15', '2026-02-15')).toEqual({
      from: '2026-02-15',
      to: '2026-02-15',
    });
  });
});
