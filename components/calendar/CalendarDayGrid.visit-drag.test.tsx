import { render } from '@testing-library/react-native';

import { CalendarDayGrid } from '@/components/calendar/CalendarDayGrid';
import type { CalendarGridBooking } from '@/types/calendar-grid';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

/**
 * Records what the grid hands each bar, so the drag wiring is asserted rather
 * than inferred. The real block is a gesture component whose behaviour only
 * exists on the UI thread; what matters here is which bars are ALLOWED to drag
 * and what they are told about themselves.
 */
const mockBlockProps: Record<string, unknown>[] = [];
jest.mock('@/components/calendar/DraggableAppointmentBlock', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    DraggableAppointmentBlock: (props: Record<string, unknown>) => {
      mockBlockProps.push(props);
      return React.createElement(View, { testID: `bar-${props.id as string}` });
    },
  };
});

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

function renderGrid(bookings: CalendarGridBooking[]) {
  return render(
    <CalendarDayGrid
      bookings={bookings}
      workingHours={[{ start: '09:00', end: '17:00' }]}
      nowMinutes={null}
      onBlockPress={jest.fn()}
      onEmptyPress={jest.fn()}
      onDragReschedule={jest.fn()}
      onDragResize={jest.fn()}
    />,
  );
}

/** The props of the bar keyed on `id` (a merged bar is keyed on its lead). */
function bar(id: string): Record<string, unknown> {
  const found = mockBlockProps.find((p) => p.id === id);
  if (!found) throw new Error(`no bar rendered for ${id}`);
  return found;
}

beforeEach(() => {
  mockBlockProps.length = 0;
});

describe('CalendarDayGrid — dragging one service of a visit (web #187)', () => {
  it('lets each service of a visit drag and resize on its own', async () => {
    await renderGrid([
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1' }),
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1' }),
      booking('b3', '11:00', '11:30', { group_booking_id: 'g1' }),
    ]);
    expect(bar('b1').draggable).toBe(true);
    expect(bar('b2').draggable).toBe(true);
    expect(bar('b3').draggable).toBe(true);
    // No visit-wide floor any more: each bar keeps the block's own one-snap floor.
    expect(bar('b2').minDurationMinutes).toBeUndefined();
  });

  it('lets each person of a party drag on their own, as any booking', async () => {
    await renderGrid([
      booking('p1', '10:00', '11:00', { group_booking_id: 'g1', person_label: 'Person 1' }),
      booking('p2', '10:00', '10:30', { group_booking_id: 'g1', person_label: 'Person 2' }),
    ]);
    expect(bar('p1').draggable).toBe(true);
    expect(bar('p1').segmentIds).toEqual(['p1']);
  });

  it('tells a service every live sibling of its visit in the column, so a move over one is allowed', async () => {
    // Overlapping a sibling is permitted (and toasted) rather than refused as
    // a clash, so the busy-range check must not see the visit's own rows.
    await renderGrid([
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1' }),
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1' }),
      booking('b3', '11:00', '11:30', { group_booking_id: 'g1', status: 'Cancelled' }),
    ]);
    expect(bar('b1').segmentIds).toEqual(['b1', 'b2']);
  });

  it('leaves an ordinary booking exactly as it was', async () => {
    await renderGrid([booking('solo', '10:00', '10:30')]);
    expect(bar('solo').draggable).toBe(true);
    expect(bar('solo').segmentIds).toEqual(['solo']);
    // Undefined, so the block keeps its own one-snap floor.
    expect(bar('solo').minDurationMinutes).toBeUndefined();
  });

  it('still refuses to drag a visit in a status that cannot move', async () => {
    await renderGrid([
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1', status: 'Completed' }),
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1', status: 'Completed' }),
    ]);
    expect(bar('b1').draggable).toBe(false);
  });
});
