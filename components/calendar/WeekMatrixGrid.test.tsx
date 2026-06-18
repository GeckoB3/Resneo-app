/**
 * WeekMatrixGrid (Calendar 02) — whole-team week matrix.
 *
 * Render tests the per-cell count derivation off the raw calendar-grid payload:
 * a practitioner row × day column shows the No-Show-excluded booking count, an
 * empty cell shows a dash, and tapping a day header / cell drills into that day.
 */
import { fireEvent, render, screen, act } from '@testing-library/react-native';

import { WeekMatrixGrid } from '@/components/calendar/WeekMatrixGrid';
import type { CalendarGridResponse, CalendarGridBooking } from '@/types/calendar-grid';

function booking(id: string, status = 'Booked'): CalendarGridBooking {
  return {
    id,
    guestName: 'Guest',
    serviceName: 'Service',
    startTime: '10:00',
    endTime: '10:30',
    status,
  };
}

const CALENDARS = [
  { id: 'p1', name: 'Alex' },
  { id: 'p2', name: 'Sam' },
];

const DAYS = [
  { date: '2026-06-15', weekdayLabel: 'Mon', dayNumber: '15', isToday: true, isWeekend: false },
  { date: '2026-06-16', weekdayLabel: 'Tue', dayNumber: '16', isToday: false, isWeekend: false },
];

const GRID: CalendarGridResponse = {
  calendars: [
    {
      calendarId: 'p1',
      calendarName: 'Alex',
      dates: [
        {
          date: '2026-06-15',
          workingHours: [],
          blocks: [],
          sessions: [],
          // 2 live + 1 No-Show → count should be 2.
          bookings: [booking('a1'), booking('a2'), booking('a3', 'No-Show')],
        },
        { date: '2026-06-16', workingHours: [], blocks: [], sessions: [], bookings: [] },
      ],
    },
    {
      calendarId: 'p2',
      calendarName: 'Sam',
      dates: [
        {
          date: '2026-06-16',
          workingHours: [],
          blocks: [],
          sessions: [],
          bookings: [booking('b1')],
        },
      ],
    },
  ],
};

describe('WeekMatrixGrid', () => {
  it('counts bookings per practitioner+day, excluding No-Show', async () => {
    await render(
      <WeekMatrixGrid
        calendars={CALENDARS}
        days={DAYS}
        grid={GRID}
        onDayPress={() => {}}
        onCellPress={() => {}}
      />,
    );
    // Alex / Mon = 2 (No-Show dropped).
    expect(
      screen.getByLabelText('Alex, Mon 15, 2 bookings'),
    ).toBeTruthy();
    // Sam / Tue = 1 (singular wording).
    expect(screen.getByLabelText('Sam, Tue 16, 1 booking')).toBeTruthy();
    // Alex / Tue = 0 (empty).
    expect(screen.getByLabelText('Alex, Tue 16, 0 bookings')).toBeTruthy();
  });

  it('renders a row per practitioner and a header per day', async () => {
    await render(
      <WeekMatrixGrid
        calendars={CALENDARS}
        days={DAYS}
        grid={GRID}
        onDayPress={() => {}}
        onCellPress={() => {}}
      />,
    );
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByText('Sam')).toBeTruthy();
    // Day-header drill-in affordance present.
    expect(screen.getByLabelText('Mon 15, today, open day view')).toBeTruthy();
  });

  it('fires onDayPress from a day header and onCellPress from a cell', async () => {
    const onDayPress = jest.fn();
    const onCellPress = jest.fn();
    await render(
      <WeekMatrixGrid
        calendars={CALENDARS}
        days={DAYS}
        grid={GRID}
        onDayPress={onDayPress}
        onCellPress={onCellPress}
      />,
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Tue 16, open day view'));
    });
    expect(onDayPress).toHaveBeenCalledWith('2026-06-16');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Alex, Mon 15, 2 bookings'));
    });
    expect(onCellPress).toHaveBeenCalledWith('p1', '2026-06-15');
  });

  it('handles an undefined grid (all cells empty)', async () => {
    await render(
      <WeekMatrixGrid
        calendars={CALENDARS}
        days={DAYS}
        grid={undefined}
        onDayPress={() => {}}
        onCellPress={() => {}}
      />,
    );
    expect(screen.getByLabelText('Alex, Mon 15, 0 bookings')).toBeTruthy();
  });
});
