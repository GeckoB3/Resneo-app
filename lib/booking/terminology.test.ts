import {
  bookingsScreenTitle,
  clientsScreenTitle,
  mergeTerminology,
  newBookingActionLabel,
  partySizeLabel,
  todaySectionTitle,
} from '@/lib/booking/terminology';

/**
 * Venue terminology helpers (pure). These derive UI copy from a venue's
 * configurable booking/client/staff nouns, with sensible defaults.
 */

describe('mergeTerminology', () => {
  it('fills missing fields from the defaults (Guest / Reservation / Staff)', () => {
    expect(mergeTerminology(null)).toEqual({ client: 'Guest', booking: 'Reservation', staff: 'Staff' });
    expect(mergeTerminology(undefined)).toEqual({ client: 'Guest', booking: 'Reservation', staff: 'Staff' });
  });

  it('overrides defaults with the provided terminology', () => {
    expect(mergeTerminology({ client: 'Client', booking: 'Booking', staff: 'Therapist' })).toEqual({
      client: 'Client',
      booking: 'Booking',
      staff: 'Therapist',
    });
  });

  it('keeps defaults for fields not supplied in a partial override', () => {
    expect(mergeTerminology({ booking: 'Appointment' } as never)).toEqual({
      client: 'Guest',
      booking: 'Appointment',
      staff: 'Staff',
    });
  });
});

describe('partySizeLabel', () => {
  it('uses "guest(s)" for appointments (non table reservation)', () => {
    expect(partySizeLabel(1, { isAppointment: true })).toBe('1 guest');
    expect(partySizeLabel(3, { isAppointment: true })).toBe('3 guests');
  });

  it('uses "cover(s)" for non-appointment (dining) bookings', () => {
    expect(partySizeLabel(1, { isAppointment: false })).toBe('1 cover');
    expect(partySizeLabel(4, { isAppointment: false })).toBe('4 covers');
  });

  it('uses "guest(s)" for an appointment that is also a table reservation', () => {
    expect(partySizeLabel(2, { isAppointment: true, isTableReservation: true })).toBe('2 guests');
    expect(partySizeLabel(1, { isAppointment: true, isTableReservation: true })).toBe('1 guest');
  });
});

describe('newBookingActionLabel', () => {
  it('lowercases the booking term in a "New …" label', () => {
    expect(newBookingActionLabel(null)).toBe('New reservation');
    expect(newBookingActionLabel({ booking: 'Booking' } as never)).toBe('New booking');
  });
});

describe('todaySectionTitle', () => {
  it('always says "Today\'s appointments" for appointment venues', () => {
    expect(todaySectionTitle(null, true)).toBe(`Today's appointments`);
    expect(todaySectionTitle({ booking: 'Reservation' } as never, true)).toBe(`Today's appointments`);
  });

  it('pluralises the lowercased booking term otherwise', () => {
    expect(todaySectionTitle(null, false)).toBe(`Today's reservations`);
    expect(todaySectionTitle({ booking: 'Booking' } as never, false)).toBe(`Today's bookings`);
  });
});

describe('clientsScreenTitle', () => {
  it('is always "Contacts" regardless of terminology', () => {
    expect(clientsScreenTitle()).toBe('Contacts');
    expect(clientsScreenTitle({ client: 'Client' } as never)).toBe('Contacts');
  });
});

describe('bookingsScreenTitle', () => {
  it('is "Appointments" for appointment venues', () => {
    expect(bookingsScreenTitle(null, true)).toBe('Appointments');
    expect(bookingsScreenTitle({ booking: 'Reservation' } as never, true)).toBe('Appointments');
  });

  it('pluralises the booking term (keeping its case) otherwise', () => {
    expect(bookingsScreenTitle(null, false)).toBe('Reservations');
    expect(bookingsScreenTitle({ booking: 'Booking' } as never, false)).toBe('Bookings');
  });
});
