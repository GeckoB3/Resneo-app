import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

/**
 * As in the overlap suite: the bars sit inside a GestureDetector whose
 * `useAnimatedGesture` needs Reanimated's `useEvent`, absent from the project's
 * lightweight mock. This suite is about geometry and wiring, not gestures.
 */
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
import { PX_PER_MINUTE } from '@/components/calendar/grid-layout';
import type { CalendarGridBooking } from '@/types/calendar-grid';

/**
 * The device-reported bug: "bookings with multiple services are displaying as
 * several separate bookings on the calendar". Each service is its own `bookings`
 * row sharing a `group_booking_id`, and the grid drew one bar per row.
 *
 * Driven through the real grid, because the promise is about what is rendered:
 * ONE bar, spanning the whole visit, and still no overlap with its neighbours.
 */
function booking(
  id: string,
  startTime: string,
  endTime: string,
  over: Partial<CalendarGridBooking> = {},
): CalendarGridBooking {
  return {
    id,
    startTime,
    endTime,
    guestName: 'Sam Patel',
    serviceName: 'Cut',
    status: 'Booked',
    ...over,
  };
}

/** The rendered top/height of each appointment bar, in document order. */
function renderedBars() {
  return screen
    .getAllByLabelText(/Sam Patel|Other Guest/)
    .map((node) => {
      let current: typeof node | null = node;
      for (let depth = 0; current && depth < 6; depth += 1) {
        const style = flatten(current.props?.style);
        if (style && typeof style.top === 'number' && typeof style.height === 'number') {
          return { top: style.top, height: style.height };
        }
        current = current.parent;
      }
      return null;
    })
    .filter((v): v is { top: number; height: number } => v != null);
}

function flatten(style: unknown): Record<string, unknown> | null {
  if (!style) return null;
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, part) => ({ ...acc, ...(flatten(part) ?? {}) }),
      {},
    );
  }
  return typeof style === 'object' ? (style as Record<string, unknown>) : null;
}

const workingHours = [{ start: '09:00', end: '17:00' }];

function renderGrid(bookings: CalendarGridBooking[], props: Record<string, unknown> = {}) {
  return render(
    <CalendarDayGrid
      bookings={bookings}
      workingHours={workingHours}
      nowMinutes={null}
      onBlockPress={jest.fn()}
      onEmptyPress={jest.fn()}
      {...props}
    />,
  );
}

describe('CalendarDayGrid — a multi-service visit is one bar', () => {
  it('draws three services as ONE bar spanning the whole visit', async () => {
    await renderGrid([
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1', serviceName: 'Cut' }),
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1', serviceName: 'Colour' }),
      booking('b3', '11:00', '11:30', { group_booking_id: 'g1', serviceName: 'Blow-dry' }),
    ]);

    const bars = renderedBars();
    expect(bars).toHaveLength(1);
    // 10:00 → 11:30 is 90 minutes, not the 30 of its first service.
    expect(bars[0].height).toBe(90 * PX_PER_MINUTE);
  });

  it('names every service on the bar, in visit order', async () => {
    await renderGrid([
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1', serviceName: 'Colour' }),
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1', serviceName: 'Cut' }),
    ]);
    expect(screen.getByText('Cut → Colour')).toBeTruthy();
  });

  it('opens the visit from its earliest booking', async () => {
    const onBlockPress = jest.fn();
    await renderGrid(
      [
        booking('b-late', '10:30', '11:00', { group_booking_id: 'g1' }),
        booking('b-early', '10:00', '10:30', { group_booking_id: 'g1' }),
      ],
      { onBlockPress },
    );

    fireEvent.press(screen.getAllByLabelText(/Sam Patel/)[0]!);
    expect(onBlockPress).toHaveBeenCalledWith('b-early');
  });

  it('spans to the LATEST end when a group is booked at one time', async () => {
    // Three people at 10:00 for 60, 30 and 45 minutes. Ending the bar at the
    // last-starting segment (what the web does) would draw 30 minutes here.
    await renderGrid([
      booking('b-long', '10:00', '11:00', { group_booking_id: 'g1' }),
      booking('b-mid', '10:00', '10:45', { group_booking_id: 'g1' }),
      booking('b-short', '10:00', '10:30', { group_booking_id: 'g1' }),
    ]);

    const bars = renderedBars();
    expect(bars).toHaveLength(1);
    expect(bars[0].height).toBe(60 * PX_PER_MINUTE);
  });

  it('leaves unrelated bookings as their own bars, and clear of the visit', async () => {
    await renderGrid([
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1' }),
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1' }),
      booking('other', '11:00', '11:30', { guestName: 'Other Guest' }),
    ]);

    const bars = renderedBars().sort((a, b) => a.top - b.top);
    expect(bars).toHaveLength(2);
    // The merged visit must not run into the booking that follows it.
    expect(bars[0].top + bars[0].height).toBeLessThanOrEqual(bars[1].top);
  });

  it('still draws a lone member of a group as an ordinary booking', async () => {
    // Its siblings are hidden by the status filter, or sit on another calendar.
    await renderGrid([booking('b1', '10:00', '10:30', { group_booking_id: 'g1' })]);
    expect(renderedBars()[0].height).toBe(30 * PX_PER_MINUTE);
  });

  it('does not merge two different visits that happen to be adjacent', async () => {
    await renderGrid([
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1' }),
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1' }),
      booking('c1', '11:00', '11:30', { group_booking_id: 'g2', guestName: 'Other Guest' }),
      booking('c2', '11:30', '12:00', { group_booking_id: 'g2', guestName: 'Other Guest' }),
    ]);
    expect(renderedBars()).toHaveLength(2);
  });
});

describe('CalendarDayGrid — quick actions on a merged visit', () => {
  /**
   * A merged bar carries ONE tray, so the action has to reach the whole visit —
   * starting the first service and leaving the rest Booked would be worse than
   * not offering it. "Start" is a Booked bar's tray action (`pickTrayActions`).
   */
  it('advances EVERY service, skipping any already there', async () => {
    const onStatusChange = jest.fn();
    await renderGrid(
      [
        booking('b1', '10:00', '10:30', { group_booking_id: 'g1', status: 'Booked' }),
        booking('b2', '10:30', '11:00', { group_booking_id: 'g1', status: 'Booked' }),
        booking('b3', '11:00', '11:30', { group_booking_id: 'g1', status: 'Seated' }),
      ],
      { onStatusChange },
    );

    fireEvent.press(screen.getByLabelText('Start'));

    const patched = onStatusChange.mock.calls.map(([id]) => id);
    expect(patched).toEqual(expect.arrayContaining(['b1', 'b2']));
    // Already Seated — skipping it is the point, and it keeps a part-done visit
    // from firing pointless mutations that each raise their own error toast.
    expect(patched).not.toContain('b3');
  });

  it('marks the whole visit arrived from one tap', async () => {
    const onArrivalToggle = jest.fn();
    await renderGrid(
      [
        booking('b1', '10:00', '10:30', { group_booking_id: 'g1' }),
        booking('b2', '10:30', '11:00', { group_booking_id: 'g1' }),
      ],
      { onArrivalToggle },
    );

    fireEvent.press(screen.getByLabelText('Arrived'));

    expect(onArrivalToggle.mock.calls.map(([id]) => id)).toEqual(['b1', 'b2']);
  });

  it('still acts on just the one booking when nothing is merged', async () => {
    const onStatusChange = jest.fn();
    await renderGrid([booking('solo', '10:00', '10:30', { status: 'Booked' })], { onStatusChange });

    fireEvent.press(screen.getByLabelText('Start'));

    expect(onStatusChange.mock.calls).toEqual([['solo', 'Seated']]);
  });
});
