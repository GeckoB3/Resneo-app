/**
 * AllCalendarsDayGrid — a linked calendar's column is drawn like an own one
 * (no amber, 2026-09-06) and is told apart by the small pill the column
 * carries next to its name, plus the venue caption under it.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

jest.mock('react-native-gesture-handler', () => {
  const ReactLib = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const chainable = (): Record<string, () => unknown> =>
    new Proxy({}, { get: () => () => chainable() }) as Record<string, () => unknown>;
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      ReactLib.createElement(View, null, children),
    Gesture: new Proxy({}, { get: () => () => chainable() }),
  };
});

import {
  AllCalendarsDayGrid,
  type AllCalendarColumn,
} from '@/components/calendar/AllCalendarsDayGrid';

function column(overrides: Partial<AllCalendarColumn> & { calendarId: string }): AllCalendarColumn {
  return {
    calendarName: overrides.calendarId,
    workingHours: [{ start: '09:00', end: '17:00' }],
    bookings: [],
    sessions: [],
    timeBlocks: [],
    scheduleBlocks: [],
    ...overrides,
  };
}

describe('AllCalendarsDayGrid — linked columns', () => {
  it('marks a linked column with its pill and venue caption, and an own column with neither', async () => {
    await render(
      <AllCalendarsDayGrid
        embedded
        calendars={[
          column({ calendarId: 'own-1', calendarName: 'Sam' }),
          column({
            calendarId: 'linked:v1:p1',
            calendarName: 'Jenny',
            caption: 'light2',
            linked: true,
            badge: 'Linked',
          }),
        ]}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.getByText('Jenny')).toBeTruthy();
    expect(screen.getByText('light2')).toBeTruthy();
    expect(screen.getAllByText('Linked')).toHaveLength(1);
  });

  it('marks a paused own column, and still reports a tap on it so the screen can say why', async () => {
    const onEmptyPress = jest.fn();
    await render(
      <AllCalendarsDayGrid
        embedded
        calendars={[
          column({ calendarId: 'own-1', calendarName: 'Sam' }),
          column({ calendarId: 'own-2', calendarName: 'Marcus', badge: 'Paused', acceptsDrops: false }),
        ]}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={onEmptyPress}
      />,
    );
    expect(screen.getAllByText('Paused')).toHaveLength(1);
    fireEvent.press(screen.getByLabelText('Tap an empty slot to add a booking for Marcus'), {
      nativeEvent: { locationY: 120 },
    });
    expect(onEmptyPress).toHaveBeenCalledWith('own-2', expect.any(String));
  });

  it("draws a resolved linked column's closures by cause, and an older feed's as the linked venue's", async () => {
    // Both partner venues are shut after 17:00; the grid runs to 18:00.
    const shutAt17 = { kind: 'open' as const, periods: [{ start: 9 * 60, end: 17 * 60 }] };
    await render(
      <AllCalendarsDayGrid
        embedded
        calendars={[
          column({
            calendarId: 'linked:v1:p1',
            calendarName: 'Jenny',
            linked: true,
            linkedClosures: 'resolved',
            workingHours: [{ start: '09:00', end: '18:00' }],
            venueHours: shutAt17,
          }),
          column({
            calendarId: 'linked:v2:p2',
            calendarName: 'Sam',
            linked: true,
            workingHours: [{ start: '09:00', end: '18:00' }],
            venueHours: shutAt17,
          }),
        ]}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Venue closed 17:00 to 18:00')).toBeTruthy();
    expect(screen.getByLabelText('Linked venue closed 17:00 to 18:00')).toBeTruthy();
  });

  it('bands every other hour, as the single-calendar grid does', async () => {
    await render(
      <AllCalendarsDayGrid
        embedded
        calendars={[
          column({
            calendarId: 'linked:v1:p1',
            calendarName: 'Jenny',
            linked: true,
            workingHours: [{ start: '09:00', end: '13:00' }],
          }),
        ]}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );
    // Hours 09:00–13:00: four hour rows before the closing line, every other one banded.
    expect(screen.getAllByTestId('hour-band')).toHaveLength(2);
  });

  it('leaves the column-header row out when told to', async () => {
    await render(
      <AllCalendarsDayGrid
        embedded
        showColumnHeaders={false}
        calendars={[column({ calendarId: 'linked:v1:p1', calendarName: 'Jenny', linked: true })]}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('column-headers')).toBeNull();
    expect(screen.queryByText('Jenny')).toBeNull();
    // The column itself is still there to tap.
    expect(screen.getByLabelText('Tap an empty slot to add a booking for Jenny')).toBeTruthy();
  });

  it('shows no pill on a linked column that is not given one', async () => {
    await render(
      <AllCalendarsDayGrid
        embedded
        calendars={[column({ calendarId: 'linked:v1:p1', calendarName: 'Jenny', linked: true })]}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Jenny')).toBeTruthy();
    expect(screen.queryByText('Linked')).toBeNull();
  });
});

describe('AllCalendarsDayGrid — an editable linked column', () => {
  const booked = {
    id: 'b1',
    guestName: 'Ada Lovelace',
    serviceName: 'Cut',
    startTime: '10:00',
    endTime: '10:30',
    status: 'Booked',
  };
  const RESIZE_HANDLE = 'Touch and hold the bottom edge to change duration';

  it('draws the interactive bar, with its resize grip, on a linked column marked editable', async () => {
    await render(
      <AllCalendarsDayGrid
        embedded
        calendars={[
          column({
            calendarId: 'linked:v1:p1',
            calendarName: 'Jenny',
            linked: true,
            editable: true,
            moveGroup: 'v1',
            bookings: [booked],
          }),
        ]}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
        onDragReschedule={jest.fn()}
        onDragResize={jest.fn()}
      />,
    );
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByLabelText(RESIZE_HANDLE)).toBeTruthy();
  });

  it('keeps a static bar on a linked column that is not editable, whatever callbacks it is given', async () => {
    await render(
      <AllCalendarsDayGrid
        embedded
        calendars={[
          column({
            calendarId: 'linked:v1:p1',
            calendarName: 'Jenny',
            linked: true,
            bookings: [booked],
          }),
        ]}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
        onDragReschedule={jest.fn()}
        onDragResize={jest.fn()}
      />,
    );
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.queryByLabelText(RESIZE_HANDLE)).toBeNull();
  });

  it('draws the interactive bar on an own column as before', async () => {
    await render(
      <AllCalendarsDayGrid
        embedded
        calendars={[column({ calendarId: 'own-1', calendarName: 'Sam', bookings: [booked] })]}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
        onDragReschedule={jest.fn()}
        onDragResize={jest.fn()}
      />,
    );
    expect(screen.getByLabelText(RESIZE_HANDLE)).toBeTruthy();
  });
});
