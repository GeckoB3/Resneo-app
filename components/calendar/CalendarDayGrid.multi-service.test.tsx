import { fireEvent, render, screen } from '@testing-library/react-native';

import { CalendarDayGrid } from '@/components/calendar/CalendarDayGrid';
import { PX_PER_MINUTE } from '@/components/calendar/grid-layout';
import type { CalendarGridBooking } from '@/types/calendar-grid';

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

describe('CalendarDayGrid — a multi-service visit is one bar per service (web #187)', () => {
  it('draws three services as THREE bars, each its own length', async () => {
    await renderGrid([
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1', serviceName: 'Cut' }),
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1', serviceName: 'Colour' }),
      booking('b3', '11:00', '11:45', { group_booking_id: 'g1', serviceName: 'Blow-dry' }),
    ]);

    const bars = renderedBars().sort((a, b) => a.top - b.top);
    expect(bars).toHaveLength(3);
    expect(bars.map((b) => b.height)).toEqual([
      30 * PX_PER_MINUTE,
      30 * PX_PER_MINUTE,
      45 * PX_PER_MINUTE,
    ]);
    // Each bar names its own service, not the whole visit.
    expect(screen.getByText('Cut')).toBeTruthy();
    expect(screen.getByText('Colour')).toBeTruthy();
    expect(screen.queryByText('Cut → Colour → Blow-dry')).toBeNull();
  });

  it('marks every service with its place in the visit', async () => {
    await renderGrid([
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1' }),
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1' }),
    ]);
    expect(screen.getByLabelText('Visit 1/2')).toBeTruthy();
    expect(screen.getByLabelText('Visit 2/2')).toBeTruthy();
  });

  it('draws a spine across the seam where two services of a visit touch', async () => {
    await renderGrid([
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1' }),
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1' }),
      booking('b3', '11:15', '11:45', { group_booking_id: 'g1' }),
    ]);
    // b1 and b2 touch: one bottom spine and one top spine. b3 waits 15 minutes: none.
    expect(screen.getAllByTestId('visit-spine-bottom')).toHaveLength(1);
    expect(screen.getAllByTestId('visit-spine-top')).toHaveLength(1);
  });

  it('gives a lone member of a group, and an ordinary booking, no chip', async () => {
    await renderGrid([
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1' }),
      booking('other', '11:00', '11:30', { guestName: 'Other Guest' }),
    ]);
    expect(screen.queryAllByTestId('visit-chip')).toHaveLength(0);
  });

  it('opens the tapped service, not the visit’s first', async () => {
    const onBlockPress = jest.fn();
    await renderGrid(
      [
        booking('b-late', '10:30', '11:00', { group_booking_id: 'g1' }),
        booking('b-early', '10:00', '10:30', { group_booking_id: 'g1' }),
      ],
      { onBlockPress },
    );

    fireEvent.press(screen.getByLabelText(/10:30–11:00, Sam Patel/));
    expect(onBlockPress).toHaveBeenCalledWith('b-late');
  });

  it('keeps unrelated bookings clear of the visit’s bars', async () => {
    await renderGrid([
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1' }),
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1' }),
      booking('other', '11:00', '11:30', { guestName: 'Other Guest' }),
    ]);

    const bars = renderedBars().sort((a, b) => a.top - b.top);
    expect(bars).toHaveLength(3);
    expect(bars[1].top + bars[1].height).toBeLessThanOrEqual(bars[2].top);
  });
});

describe('CalendarDayGrid — quick actions on a service of a visit', () => {
  /**
   * Start and Complete are per service (web #187): a merged bar's tray acts on
   * the service the press means, and reads its status from the visit's derived
   * one. ONE call, not one per segment — the screen batches from this list.
   */
  it('starts the pressed service only', async () => {
    const onStatusChange = jest.fn();
    await renderGrid(
      [
        booking('b1', '10:00', '10:30', { group_booking_id: 'g1', status: 'Completed' }),
        booking('b2', '10:30', '11:00', { group_booking_id: 'g1', status: 'Booked' }),
        booking('b3', '11:00', '11:30', { group_booking_id: 'g1', status: 'Booked' }),
      ],
      { onStatusChange },
    );

    // Colour done; the cut and the finish each carry their own Start.
    fireEvent.press(screen.getAllByLabelText('Start')[0]!);

    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(onStatusChange.mock.calls[0]).toEqual([['b2'], 'Seated']);
  });

  it('completes the service in progress, not the whole visit', async () => {
    const onStatusChange = jest.fn();
    await renderGrid(
      [
        booking('b1', '10:00', '10:30', { group_booking_id: 'g1', status: 'Seated' }),
        booking('b2', '10:30', '11:00', { group_booking_id: 'g1', status: 'Booked' }),
      ],
      { onStatusChange },
    );

    fireEvent.press(screen.getByLabelText('Complete'));

    expect(onStatusChange.mock.calls[0]).toEqual([['b1'], 'Completed']);
  });

  it('marks one service arrived; the server cascades it across the visit', async () => {
    const onArrivalToggle = jest.fn();
    await renderGrid(
      [
        booking('b1', '10:00', '10:30', { group_booking_id: 'g1' }),
        booking('b2', '10:30', '11:00', { group_booking_id: 'g1' }),
      ],
      { onArrivalToggle },
    );

    fireEvent.press(screen.getAllByLabelText('Arrived')[0]!);

    expect(onArrivalToggle).toHaveBeenCalledTimes(1);
    expect(onArrivalToggle.mock.calls[0]).toEqual([['b1'], true]);
  });

  it('still acts on just the one booking when nothing is merged', async () => {
    const onStatusChange = jest.fn();
    await renderGrid([booking('solo', '10:00', '10:30', { status: 'Booked' })], { onStatusChange });

    fireEvent.press(screen.getByLabelText('Start'));

    expect(onStatusChange.mock.calls).toEqual([[['solo'], 'Seated']]);
  });
});
