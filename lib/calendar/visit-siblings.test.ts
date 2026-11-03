import {
  gridVisitSiblingRows,
  ownSiblingOverlaps,
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
    expect(visitChipLabel(index.get('b')!)).toBe('2/2');
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

describe('ownSiblingOverlaps (split-visit plan G13, G16)', () => {
  it('finds the siblings a window would land on in the same column', () => {
    const rows = [row('a', '10:00'), row('b', '10:30'), row('c', '11:00')];
    const found = ownSiblingOverlaps({
      moved: rows[0]!,
      startMin: toMinutes('10:45'),
      endMin: toMinutes('11:15'),
      columnId: 'cal-1',
      rows,
      columnIdOf,
      spanMinutesOf,
      toMinutes,
    });
    expect(found.sameColumn.map((r) => r.id)).toEqual(['b', 'c']);
    expect(found.otherColumns).toEqual([]);
  });

  it('puts a sibling on another column apart: the client would be in two places', () => {
    // A cut with Aisha at 10:00, a manicure with Steph at 10:45: the cut moved to
    // 10:30 now runs into the manicure.
    const rows = [row('cut', '10:00'), row('mani', '10:45'), row('other', '10:30', { group_booking_id: 'g9' })];
    const found = ownSiblingOverlaps({
      moved: rows[0]!,
      startMin: toMinutes('10:30'),
      endMin: toMinutes('11:00'),
      columnId: 'aisha',
      rows,
      columnIdOf: (r) => (r.id === 'mani' ? 'steph' : 'aisha'),
      spanMinutesOf,
      toMinutes,
    });
    expect(found.sameColumn).toEqual([]);
    expect(found.otherColumns.map((r) => r.id)).toEqual(['mani']);
  });

  it('ignores a cancelled sibling and a party', () => {
    const rows = [
      row('a', '10:00'),
      row('b', '10:00', { status: 'Cancelled' }),
      row('p', '10:00', { group_booking_id: 'g1', person_label: 'Ana' }),
    ];
    const found = ownSiblingOverlaps({
      moved: rows[0]!,
      startMin: toMinutes('10:00'),
      endMin: toMinutes('10:30'),
      columnId: 'cal-1',
      rows,
      columnIdOf,
      spanMinutesOf,
      toMinutes,
    });
    expect([...found.sameColumn, ...found.otherColumns]).toEqual([]);
  });
});

describe('chips count the whole visit the grid holds (split-visit plan G15)', () => {
  const booking = (id: string, startTime: string, group: string | null = 'g1') => ({
    id,
    guestName: 'Sam',
    serviceName: 'Cut',
    startTime,
    endTime: '',
    status: 'Booked',
    group_booking_id: group,
  });
  const calendars = [
    { calendarId: 'shown', calendarName: 'Aisha', dates: [{ date: '2026-11-03', workingHours: [], bookings: [booking('cut', '10:00')], blocks: [], sessions: [] }] },
    // A calendar the column filter hides still holds the visit's other service.
    { calendarId: 'hidden', calendarName: 'Steph', dates: [{ date: '2026-11-03', workingHours: [], bookings: [booking('mani', '10:45')], blocks: [], sessions: [] }] },
  ];

  it('counts a sibling on a column that is not drawn', () => {
    const positions = visitSiblingIndex(gridVisitSiblingRows(calendars, ['2026-11-03']));
    expect(visitChipLabel(positions.get('cut')!)).toBe('1/2');
    expect(visitChipLabel(positions.get('mani')!)).toBe('2/2');
  });

  it('counts a partner row handed in beside the grid, once', () => {
    const extra = [{ id: 'brow', group_booking_id: 'g1', startTime: '11:30', status: 'Booked', date: '2026-11-03' }];
    const positions = visitSiblingIndex(gridVisitSiblingRows(calendars, ['2026-11-03'], [...extra, ...extra]));
    expect(positions.get('brow')).toEqual({ groupId: 'g1', index: 2, count: 3, anchorId: 'cut' });
  });

  it('leaves out other days, and orders a week by date then start', () => {
    const week = [
      ...calendars,
      { calendarId: 'shown', calendarName: 'Aisha', dates: [{ date: '2026-11-02', workingHours: [], bookings: [booking('wash', '16:00')], blocks: [], sessions: [] }] },
    ];
    expect(visitSiblingIndex(gridVisitSiblingRows(week, ['2026-11-03'])).get('cut')?.count).toBe(2);
    const positions = visitSiblingIndex(gridVisitSiblingRows(week, ['2026-11-02', '2026-11-03']));
    expect(positions.get('wash')).toEqual({ groupId: 'g1', index: 0, count: 3, anchorId: 'wash' });
    expect(positions.get('cut')?.index).toBe(1);
  });
});
