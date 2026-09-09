import {
  ownSiblingOverlapCount,
  visitChipLabel,
  visitSiblingIndex,
  visitTouchingEdges,
  type VisitSiblingRow,
} from '@/lib/calendar/visit-siblings';

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const span = new Map<string, number>();
const spanMinutesOf = (row: VisitSiblingRow) => span.get(row.id) ?? 30;
const columnIdOf = () => 'cal-1';

function row(id: string, startTime: string, over: Partial<VisitSiblingRow> = {}): VisitSiblingRow {
  return { id, startTime, status: 'Booked', group_booking_id: 'g1', ...over };
}

describe('visitSiblingIndex', () => {
  it('places each live service of a visit by start, with the earliest as anchor', () => {
    const index = visitSiblingIndex([row('b', '11:00'), row('a', '10:00'), row('c', '12:00', { status: 'Cancelled' })]);
    expect(index.get('a')).toEqual({ groupId: 'g1', index: 0, count: 2, anchorId: 'a' });
    expect(index.get('b')).toEqual({ groupId: 'g1', index: 1, count: 2, anchorId: 'a' });
    expect(index.has('c')).toBe(false);
    expect(visitChipLabel(index.get('b')!)).toBe('Visit 2/2');
  });

  it('ignores parties, lone members and ungrouped bookings', () => {
    const index = visitSiblingIndex([
      row('p1', '10:00', { person_label: 'Ana' }),
      row('p2', '10:00', { person_label: 'Ben' }),
      row('lone', '11:00', { group_booking_id: 'g2' }),
      row('solo', '12:00', { group_booking_id: null }),
    ]);
    expect(index.size).toBe(0);
  });
});

describe('visitTouchingEdges', () => {
  it('reports a seam where a sibling ends exactly where this one starts, and vice versa', () => {
    const rows = [row('a', '10:00'), row('b', '10:30'), row('c', '11:15')];
    const edges = (id: string) =>
      visitTouchingEdges({ row: rows.find((r) => r.id === id)!, rows, columnIdOf, spanMinutesOf, toMinutes });
    expect(edges('a')).toEqual({ top: false, bottom: true });
    expect(edges('b')).toEqual({ top: true, bottom: false });
    expect(edges('c')).toEqual({ top: false, bottom: false });
  });

  it('never joins across columns', () => {
    const rows = [row('a', '10:00'), row('b', '10:30')];
    expect(
      visitTouchingEdges({
        row: rows[0]!,
        rows,
        columnIdOf: (r) => (r.id === 'a' ? 'cal-1' : 'cal-2'),
        spanMinutesOf,
        toMinutes,
      }),
    ).toEqual({ top: false, bottom: false });
  });
});

describe('ownSiblingOverlapCount', () => {
  it('counts the siblings a window would land on, in the same column only', () => {
    const rows = [row('a', '10:00'), row('b', '10:30'), row('c', '11:00')];
    expect(
      ownSiblingOverlapCount({
        moved: rows[0]!,
        startMin: toMinutes('10:45'),
        endMin: toMinutes('11:15'),
        columnId: 'cal-1',
        rows,
        columnIdOf,
        spanMinutesOf,
        toMinutes,
      }),
    ).toBe(2);
  });
});
