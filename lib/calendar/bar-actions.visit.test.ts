/**
 * Start and Complete on a visit bar target ONE service (web #187); the
 * visit-wide facts still fan out.
 */
import { statusChangeTargets } from '@/lib/calendar/bar-actions';
import { clusterCalendarBookings, type CalendarBookingCluster } from '@/lib/calendar/cluster-bookings';
import type { CalendarGridBooking } from '@/types/calendar-grid';

function booking(
  id: string,
  startTime: string,
  status: string,
  over: Partial<CalendarGridBooking> = {},
): CalendarGridBooking {
  return {
    id,
    guestName: 'Sam Patel',
    serviceName: 'Cut',
    startTime,
    endTime: startTime,
    status,
    group_booking_id: 'g1',
    ...over,
  };
}

function visit(...statuses: string[]): CalendarBookingCluster {
  const items = statuses.map((status, i) => ({
    booking: booking(`b${i + 1}`, `1${i}:00`, status),
    start: (10 + i) * 60,
    end: (11 + i) * 60,
  }));
  return clusterCalendarBookings(items)[0]!;
}

describe('a visit bar', () => {
  it('shows the derived status', () => {
    expect(visit('Completed', 'Seated').status).toBe('Seated');
    expect(visit('Completed', 'Booked').status).toBe('Booked');
    expect(visit('Completed', 'Completed').status).toBe('Completed');
    expect(visit('Confirmed', 'Booked').status).toBe('Booked');
  });

  it('starts the next service not yet begun', () => {
    expect(statusChangeTargets(visit('Booked', 'Booked', 'Booked'), 'Seated')).toEqual(['b1']);
    expect(statusChangeTargets(visit('Completed', 'Booked', 'Booked'), 'Seated')).toEqual(['b2']);
  });

  it('completes the service in progress', () => {
    expect(statusChangeTargets(visit('Seated', 'Booked'), 'Completed')).toEqual(['b1']);
    expect(statusChangeTargets(visit('Completed', 'Seated'), 'Completed')).toEqual(['b2']);
  });

  it('undoes the start of the service in progress', () => {
    expect(statusChangeTargets(visit('Completed', 'Seated', 'Booked'), 'Booked')).toEqual(['b2']);
  });

  it('reopens the last service finished', () => {
    expect(statusChangeTargets(visit('Completed', 'Completed'), 'Seated')).toEqual(['b2']);
  });

  it('still confirms, cancels and no-shows the whole visit', () => {
    expect(statusChangeTargets(visit('Booked', 'Booked'), 'Confirmed')).toEqual(['b1', 'b2']);
    expect(statusChangeTargets(visit('Booked', 'Confirmed'), 'Cancelled')).toEqual(['b1', 'b2']);
  });

  it('leaves a party alone', () => {
    const items = [
      { booking: booking('p1', '10:00', 'Booked', { person_label: 'Ana' }), start: 600, end: 660 },
      { booking: booking('p2', '10:00', 'Booked', { person_label: 'Ben' }), start: 600, end: 660 },
    ];
    const party = clusterCalendarBookings(items)[0]!;
    expect(party.status).toBe('Booked');
    expect(statusChangeTargets(party, 'Seated')).toEqual(['p1', 'p2']);
  });
});
