/**
 * G19: the customer screens read the status the API actually sends.
 *
 * The API passes the database value through ("Cancelled", "No-Show"). The
 * screens used to compare against lower-case keys, so a cancelled booking read
 * as live and still offered Cancel and "Confirm I am coming".
 */
import { customerBookingState } from '@/lib/booking/customer-booking-state';

describe('customerBookingState', () => {
  it.each([
    ['Cancelled', 'cancelled'],
    ['No-Show', 'missed'],
    ['Completed', 'completed'],
  ] as const)('reads the API value %s as %s', (status, state) => {
    expect(customerBookingState(status)).toBe(state);
  });

  it.each(['Pending', 'Booked', 'Confirmed', 'Seated'])('reads %s as live', (status) => {
    expect(customerBookingState(status)).toBe('live');
  });

  it('still reads the lower-case and American spellings', () => {
    expect(customerBookingState('cancelled')).toBe('cancelled');
    expect(customerBookingState('canceled')).toBe('cancelled');
    expect(customerBookingState('no_show')).toBe('missed');
    expect(customerBookingState('completed')).toBe('completed');
  });

  it('treats a missing status as live', () => {
    expect(customerBookingState(null)).toBe('live');
    expect(customerBookingState(undefined)).toBe('live');
  });
});
