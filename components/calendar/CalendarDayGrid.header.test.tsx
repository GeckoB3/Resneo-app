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

import { CalendarDayGrid } from '@/components/calendar/CalendarDayGrid';

/**
 * The web's 2026-09-10 diary: the grid shows the widest of the venue's hours
 * and the calendar's, every closed minute wears exactly one stripe saying
 * why, and (the owner's ask) the column header carries the day's hours with
 * the clock button in the corner where the header meets the time column.
 */
function renderedHours(): string[] {
  return screen.getAllByText(/^\d{1,2}:\d{2}$/).map((node) => String(node.props.children));
}

describe('CalendarDayGrid — header, bounds and stripes', () => {
  it('widens to the venue hours when they run past the calendar, and says which side is closed', async () => {
    await render(
      <CalendarDayGrid
        bookings={[]}
        workingHours={[{ start: '10:00', end: '16:00' }]}
        venueHours={{ kind: 'open', periods: [{ start: 8 * 60, end: 20 * 60 }] }}
        calendarName="Hannah"
        timeBlocks={[
          {
            id: 'practitioner_closed:cal-1:d:0-600',
            start: '00:00',
            end: '10:00',
            label: 'Closed',
            isEditable: false,
            blockType: 'practitioner_closed',
          },
          {
            id: 'practitioner_closed:cal-1:d:960-1439',
            start: '16:00',
            end: '23:59',
            label: 'Closed',
            isEditable: false,
            blockType: 'practitioner_closed',
          },
        ]}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );
    const hours = renderedHours();
    expect(hours[0]).toBe('08:00');
    expect(hours[hours.length - 1]).toBe('20:00');
    // The venue is open 08–20 and Hannah works 10–16: her own stripes name her.
    expect(screen.getByText('Hannah unavailable 08:00 to 10:00')).toBeTruthy();
    expect(screen.getByText('Hannah unavailable 16:00 to 20:00')).toBeTruthy();
    expect(screen.queryByText(/Venue closed/)).toBeNull();
  });

  it('widens to the calendar hours when they run past the venue, with a venue-closed stripe', async () => {
    await render(
      <CalendarDayGrid
        bookings={[]}
        workingHours={[{ start: '08:00', end: '20:00' }]}
        venueHours={{ kind: 'open', periods: [{ start: 9 * 60, end: 18 * 60 }] }}
        calendarName="Hannah"
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );
    const hours = renderedHours();
    expect(hours[0]).toBe('08:00');
    expect(hours[hours.length - 1]).toBe('20:00');
    expect(screen.getByText('Venue closed 08:00 to 09:00')).toBeTruthy();
    expect(screen.getByText('Venue closed 18:00 to 20:00')).toBeTruthy();
  });

  it('marks minutes both are shut as the calendar closed', async () => {
    await render(
      <CalendarDayGrid
        bookings={[]}
        workingHours={[{ start: '10:00', end: '17:00' }]}
        venueHours={{ kind: 'open', periods: [{ start: 9 * 60, end: 17 * 60 }] }}
        calendarName="Hannah"
        timeBlocks={[
          {
            id: 'practitioner_closed:cal-1:d:0-600',
            start: '00:00',
            end: '10:00',
            label: 'Closed',
            isEditable: false,
            blockType: 'practitioner_closed',
          },
        ]}
        windowOverride={{ startHour: 8, endHour: null }}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Hannah closed 08:00 to 09:00')).toBeTruthy();
    expect(screen.getByText('Hannah unavailable 09:00 to 10:00')).toBeTruthy();
  });

  it('shows the name with the day’s hours under it, and the clock button in the corner', async () => {
    const onAmendHours = jest.fn();
    await render(
      <CalendarDayGrid
        bookings={[]}
        workingHours={[
          { start: '09:00', end: '12:00' },
          { start: '13:00', end: '17:00' },
        ]}
        calendarName="Hannah"
        onAmendHours={onAmendHours}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );
    expect(screen.getByTestId('day-grid-header')).toBeTruthy();
    expect(screen.getByText('Hannah')).toBeTruthy();
    expect(screen.getByText('09:00–12:00, 13:00–17:00')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Amend hours'));
    expect(onAmendHours).toHaveBeenCalledTimes(1);
  });

  it('spans the roster’s hours even when the viewed calendar works less', async () => {
    // Web `calendarWorkingBoundsForDates` runs over every active calendar, not
    // just the visible ones, so filtering to one calendar cannot narrow the day.
    await render(
      <CalendarDayGrid
        bookings={[]}
        workingHours={[{ start: '10:00', end: '16:00' }]}
        boundsRanges={[{ start: 8 * 60, end: 19 * 60 }]}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );
    const hours = renderedHours();
    expect(hours[0]).toBe('08:00');
    expect(hours[hours.length - 1]).toBe('19:00');
  });

  it('draws no header when the host names no calendar and offers no clock', async () => {
    await render(
      <CalendarDayGrid
        bookings={[]}
        workingHours={[]}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('day-grid-header')).toBeNull();
  });
});
