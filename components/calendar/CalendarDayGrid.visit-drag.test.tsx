import { render } from '@testing-library/react-native';

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

import { CalendarDayGrid } from '@/components/calendar/CalendarDayGrid';
import type { CalendarGridBooking } from '@/types/calendar-grid';

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

describe('CalendarDayGrid — dragging a merged bar', () => {
  it('lets a multi-service visit drag and resize as one', async () => {
    await renderGrid([
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1' }),
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1' }),
      booking('b3', '11:00', '11:30', { group_booking_id: 'g1' }),
    ]);
    expect(bar('b1').draggable).toBe(true);
  });

  it('refuses to drag a PARTY, which merges into a bar the same way', async () => {
    // The trap: clustering keys on group_booking_id alone, so a party is a
    // merged bar too. Dragging it as a visit would re-sequence four people
    // booked at one time into four consecutive bookings.
    await renderGrid([
      booking('p1', '10:00', '11:00', { group_booking_id: 'g1', person_label: 'Person 1' }),
      booking('p2', '10:00', '10:30', { group_booking_id: 'g1', person_label: 'Person 2' }),
    ]);
    expect(bar('p1').draggable).toBe(false);
  });

  it('tells a visit bar every row it owns, so it cannot clash with itself', async () => {
    // Busy ranges are per booking row. Without this the bar would go red against
    // its own next service the moment it was picked up.
    await renderGrid([
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1' }),
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1' }),
    ]);
    expect(bar('b1').segmentIds).toEqual(['b1', 'b2']);
  });

  it('floors a visit resize at its services’ own floors', async () => {
    await renderGrid([
      booking('b1', '10:00', '10:30', { group_booking_id: 'g1' }),
      booking('b2', '10:30', '11:00', { group_booking_id: 'g1' }),
      booking('b3', '11:00', '11:30', { group_booking_id: 'g1' }),
    ]);
    expect(bar('b1').minDurationMinutes).toBe(15);
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
