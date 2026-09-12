import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ServiceRemovalBookingsPanel } from '@/components/services/ServiceRemovalBookingsPanel';
import type { ServiceRemovalAffectedBooking } from '@/lib/services/service-removal';

/**
 * R35-1/R35-2 — the panel that asks what should happen to the bookings a removal
 * leaves behind (web parity: `ServiceRemovalBookingsDialog`).
 *
 * The two things it must get right: the destination list is FILTERED to
 * calendars that already offer the service (the booking PATCH refuses any
 * other), and the primary action says what it will do — save and leave, or move
 * and save.
 */
function booking(
  over: Partial<ServiceRemovalAffectedBooking> & { id: string },
): ServiceRemovalAffectedBooking {
  return {
    service_id: 'svc-1',
    service_name: 'Cut and finish',
    calendar_id: 'cal-1',
    calendar_name: 'Chair 1',
    booking_date: '2026-10-14',
    booking_time: '10:00',
    end_time: '11:00',
    guest_name: 'Alex Smith',
    party_size: 1,
    status: 'Booked',
    ...over,
  };
}

const confirmation = {
  message: '2 upcoming bookings are already booked for Cut and finish on Chair 1.',
  bookings: [booking({ id: 'b1' }), booking({ id: 'b2', booking_time: '12:00', end_time: '13:00' })],
  total: 2,
  truncated: false,
};

const calendars = [
  { id: 'cal-1', name: 'Chair 1' },
  { id: 'cal-2', name: 'Chair 2' },
  { id: 'cal-3', name: 'Chair 3' },
];

/** Chair 2 offers the service; Chair 3 does not, so it must not be offered. */
const offersService = (calendarId: string) => calendarId === 'cal-1' || calendarId === 'cal-2';

function renderPanel(overrides: Partial<Parameters<typeof ServiceRemovalBookingsPanel>[0]> = {}) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  return {
    onConfirm,
    onCancel,
    rendered: render(
      <ServiceRemovalBookingsPanel
        confirmation={confirmation}
        calendars={calendars}
        offersService={offersService}
        saving={false}
        failures={[]}
        error={null}
        onCancel={onCancel}
        onConfirm={onConfirm}
        {...overrides}
      />,
    ),
  };
}

describe('ServiceRemovalBookingsPanel', () => {
  it('lists the bookings under their service and calendar', async () => {
    const { rendered } = renderPanel();
    await rendered;
    expect(screen.getByText(confirmation.message)).toBeTruthy();
    expect(screen.getByText('Cut and finish on Chair 1')).toBeTruthy();
    expect(screen.getByText('2 upcoming bookings')).toBeTruthy();
    expect(screen.getByText('Wed 14 Oct, 10:00 to 11:00')).toBeTruthy();
    expect(screen.getByText('Wed 14 Oct, 12:00 to 13:00')).toBeTruthy();
  });

  it('offers only calendars that already offer the service', async () => {
    const { rendered } = renderPanel();
    await rendered;
    expect(screen.getByText('Leave them on Chair 1')).toBeTruthy();
    expect(screen.getByText('Move to Chair 2')).toBeTruthy();
    expect(screen.queryByText('Move to Chair 3')).toBeNull();
  });

  it('saves with no moves by default', async () => {
    const { rendered, onConfirm } = renderPanel();
    await rendered;
    await act(async () => {
      fireEvent.press(screen.getByText('Save and leave these bookings here'));
    });
    expect(onConfirm).toHaveBeenCalledWith([]);
  });

  it('picking a destination moves every booking in that group', async () => {
    const { rendered, onConfirm } = renderPanel();
    await rendered;
    await act(async () => {
      fireEvent.press(screen.getByText('Move to Chair 2'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Move 2 bookings and save'));
    });
    expect(onConfirm).toHaveBeenCalledWith([
      { bookingId: 'b1', targetCalendarId: 'cal-2' },
      { bookingId: 'b2', targetCalendarId: 'cal-2' },
    ]);
  });

  it('says so when there is nowhere to move them', async () => {
    const { rendered } = renderPanel({ offersService: (calendarId) => calendarId === 'cal-1' });
    await rendered;
    expect(screen.queryByText('Move to Chair 2')).toBeNull();
    expect(
      screen.getByText(
        'No other calendar offers Cut and finish, so there is nowhere to move these bookings. Add the service to another calendar first if you want to move them.',
      ),
    ).toBeTruthy();
  });

  it('names the bookings that could not be moved', async () => {
    const { rendered } = renderPanel({
      failures: [
        { bookingId: 'b1', label: 'Alex Smith, Wed 14 Oct, 10:00', reason: 'That time is taken' },
      ],
    });
    await rendered;
    expect(screen.getByText('One booking could not be moved')).toBeTruthy();
    expect(screen.getByText('Alex Smith, Wed 14 Oct, 10:00: That time is taken')).toBeTruthy();
  });

  it('says how many are not shown when the sample is capped', async () => {
    const { rendered } = renderPanel({
      confirmation: { ...confirmation, total: 320, truncated: true },
    });
    await rendered;
    expect(
      screen.getByText(
        'Showing the first 2 of 320 bookings. Only the ones listed here can be moved from this screen.',
      ),
    ).toBeTruthy();
  });
});
