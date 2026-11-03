/**
 * The week view wears the visit chip too (split-visit plan G15, web week view's `VisitChip`), and
 * counts the whole visit the diary holds across the week: a service whose siblings are on another
 * calendar, or on another day, still says where it stands.
 */
import { render, screen } from '@testing-library/react-native';

import { WeekGrid, type WeekDayColumn } from '@/components/calendar/WeekGrid';
import {
  gridVisitSiblingRows,
  siblingRowOf,
  visitSiblingIndex,
  type VisitPosition,
} from '@/lib/calendar/visit-siblings';
import type { CalendarGridBooking } from '@/types/calendar-grid';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

function booking(id: string, startTime: string, endTime: string, over: Partial<CalendarGridBooking> = {}): CalendarGridBooking {
  return { id, startTime, endTime, guestName: 'Sam Patel', serviceName: 'Cut', status: 'Booked', ...over };
}

function column(date: string, bookings: CalendarGridBooking[]): WeekDayColumn {
  return {
    date,
    weekdayLabel: 'Wed',
    dayNumber: date.slice(-2),
    isToday: false,
    isWeekend: false,
    workingHours: [{ start: '09:00', end: '17:00' }],
    bookings,
    sessions: [],
    scheduleBlocks: [],
    venueHours: { kind: 'open', periods: [{ start: 0, end: 1440 }] } as unknown as WeekDayColumn['venueHours'],
  };
}

async function renderWeek(days: WeekDayColumn[], visitPositions?: Map<string, VisitPosition>) {
  await render(
    <WeekGrid
      days={days}
      nowMinutes={null}
      onBlockPress={jest.fn()}
      onEmptyPress={jest.fn()}
      onDayPress={jest.fn()}
      visitPositions={visitPositions}
    />,
  );
}

describe('WeekGrid: the visit chip (G15)', () => {
  it('chips a service whose sibling is with someone else', async () => {
    const cut = booking('cut', '10:00', '10:45', { group_booking_id: 'g1' });
    const mani = booking('mani', '10:45', '11:15', { group_booking_id: 'g1' });
    // This week shows Aisha's calendar; Steph's manicure is in the diary all the same.
    const calendars = [
      { calendarId: 'aisha', calendarName: 'Aisha', dates: [{ date: '2026-11-04', workingHours: [], bookings: [cut], blocks: [], sessions: [] }] },
      { calendarId: 'steph', calendarName: 'Steph', dates: [{ date: '2026-11-04', workingHours: [], bookings: [mani], blocks: [], sessions: [] }] },
    ];
    const positions = visitSiblingIndex(gridVisitSiblingRows(calendars, ['2026-11-04', '2026-11-05']));
    await renderWeek([column('2026-11-04', [cut]), column('2026-11-05', [])], positions);
    expect(screen.getByLabelText('Service 1 of 2 in this visit')).toBeTruthy();
  });

  it('orders a visit over two days by date', async () => {
    const wash = booking('wash', '16:00', '16:30', { group_booking_id: 'g1' });
    const cut = booking('cut', '10:00', '10:45', { group_booking_id: 'g1' });
    const positions = visitSiblingIndex([siblingRowOf(wash, '2026-11-04'), siblingRowOf(cut, '2026-11-05')]);
    await renderWeek([column('2026-11-04', [wash]), column('2026-11-05', [cut])], positions);
    expect(screen.getByLabelText('Service 1 of 2 in this visit')).toBeTruthy();
    expect(screen.getByLabelText('Service 2 of 2 in this visit')).toBeTruthy();
  });

  it('draws no chip on an ordinary booking', async () => {
    await renderWeek([column('2026-11-04', [booking('solo', '10:00', '10:30')])]);
    expect(screen.queryAllByTestId('visit-chip')).toHaveLength(0);
  });
});
