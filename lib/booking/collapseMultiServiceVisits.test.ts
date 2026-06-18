/**
 * Unit tests for the ported multi-service-visit collapse (Domain 03).
 *
 * Mirrors the web `booking-list-row-schedule` behaviour:
 *  - several rows sharing a group_booking_id with NO person_label collapse to
 *    one representative (the earliest start);
 *  - group bookings (each person has a person_label) are left intact;
 *  - standalone rows pass through untouched;
 *  - relative order is preserved and the array is returned by reference when
 *    there is nothing to collapse.
 */
import {
  collapseMultiServiceVisits,
  isMultiServiceVisitGroup,
  type MultiServiceCollapseRow,
} from '@/lib/booking/collapseMultiServiceVisits';

function row(overrides: Partial<MultiServiceCollapseRow> & { id: string }): MultiServiceCollapseRow {
  return {
    booking_time: '09:00',
    group_booking_id: null,
    person_label: null,
    ...overrides,
  };
}

describe('isMultiServiceVisitGroup', () => {
  it('is false for zero or one row', () => {
    expect(isMultiServiceVisitGroup([])).toBe(false);
    expect(isMultiServiceVisitGroup([{ person_label: null }])).toBe(false);
  });

  it('is true when 2+ rows all lack a person_label', () => {
    expect(
      isMultiServiceVisitGroup([{ person_label: null }, { person_label: '   ' }]),
    ).toBe(true);
  });

  it('is false when any row carries a person_label (a group booking)', () => {
    expect(
      isMultiServiceVisitGroup([{ person_label: 'Person 1' }, { person_label: null }]),
    ).toBe(false);
  });
});

describe('collapseMultiServiceVisits', () => {
  it('collapses a multi-service visit to its earliest-start representative', () => {
    const rows = [
      row({ id: 'b', group_booking_id: 'g1', booking_time: '10:00' }),
      row({ id: 'a', group_booking_id: 'g1', booking_time: '09:00' }),
      row({ id: 'c', group_booking_id: 'g1', booking_time: '11:00' }),
    ];
    const out = collapseMultiServiceVisits(rows);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('a');
  });

  it('keeps group bookings (per-person labels) as separate rows', () => {
    const rows = [
      row({ id: 'p1', group_booking_id: 'g1', person_label: 'Person 1', booking_time: '09:00' }),
      row({ id: 'p2', group_booking_id: 'g1', person_label: 'Person 2', booking_time: '09:00' }),
    ];
    const out = collapseMultiServiceVisits(rows);
    expect(out.map((r) => r.id)).toEqual(['p1', 'p2']);
  });

  it('leaves standalone bookings (no group id) untouched and preserves order', () => {
    const rows = [row({ id: 'x' }), row({ id: 'y' }), row({ id: 'z' })];
    const out = collapseMultiServiceVisits(rows);
    expect(out.map((r) => r.id)).toEqual(['x', 'y', 'z']);
    // No collapse needed → same array reference (cheap-path guarantee).
    expect(out).toBe(rows);
  });

  it('collapses only the multi-service group, leaving other rows in place', () => {
    const rows = [
      row({ id: 'solo1' }),
      row({ id: 'v1', group_booking_id: 'visit', booking_time: '09:00' }),
      row({ id: 'v2', group_booking_id: 'visit', booking_time: '09:30' }),
      row({ id: 'solo2' }),
      row({ id: 'gp1', group_booking_id: 'grp', person_label: 'A' }),
      row({ id: 'gp2', group_booking_id: 'grp', person_label: 'B' }),
    ];
    const out = collapseMultiServiceVisits(rows);
    // visit collapses to v1; group booking + standalones survive; order kept.
    expect(out.map((r) => r.id)).toEqual(['solo1', 'v1', 'solo2', 'gp1', 'gp2']);
  });

  it('does not collapse a lone row that happens to carry a group_booking_id', () => {
    const rows = [row({ id: 'only', group_booking_id: 'g1' })];
    const out = collapseMultiServiceVisits(rows);
    expect(out.map((r) => r.id)).toEqual(['only']);
  });

  it('treats blank/whitespace group ids as no group', () => {
    const rows = [
      row({ id: 'a', group_booking_id: '   ' }),
      row({ id: 'b', group_booking_id: '' }),
    ];
    const out = collapseMultiServiceVisits(rows);
    expect(out.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('sorts nullable times so a missing time still picks a representative deterministically', () => {
    const rows = [
      row({ id: 'late', group_booking_id: 'g1', booking_time: '14:00' }),
      row({ id: 'nullTime', group_booking_id: 'g1', booking_time: null }),
    ];
    const out = collapseMultiServiceVisits(rows);
    // null sorts before any HH:mm string → the null-time row is the representative.
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('nullTime');
  });
});
