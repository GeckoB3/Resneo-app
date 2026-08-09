import {
  bookingsScreenTitle,
  clientsScreenTitle,
  mergeTerminology,
  mergeVenueTerminology,
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

/**
 * Model-aware resolution (R12-4) — port of the web `mergeVenueTerminology`.
 *
 * The app used to fall back to table-booking wording for every venue and had no
 * notion of the booking model at all, so an appointments venue could be told it
 * had a "Reservation". The web moved both its stored default and its display
 * resolution off that wording (migrations 20270103124000); this keeps the app in
 * step, including the rule that a stored word which is merely the OLD table
 * default is drift rather than a choice.
 */
describe('mergeVenueTerminology', () => {
  it('uses the model default when nothing is stored', () => {
    expect(mergeVenueTerminology('unified_scheduling', null)).toEqual({
      client: 'Client',
      booking: 'Appointment',
      staff: 'Staff',
    });
    expect(mergeVenueTerminology('class_session', undefined)).toEqual({
      client: 'Member',
      booking: 'Booking',
      staff: 'Instructor',
    });
  });

  it('keeps table wording for a venue that really is a restaurant', () => {
    expect(mergeVenueTerminology('table_reservation', null)).toEqual({
      client: 'Guest',
      booking: 'Reservation',
      staff: 'Staff',
    });
    // Stored table words on the table model are a genuine choice, not drift.
    expect(
      mergeVenueTerminology('table_reservation', {
        client: 'Guest',
        booking: 'Reservation',
        staff: 'Staff',
      }),
    ).toEqual({ client: 'Guest', booking: 'Reservation', staff: 'Staff' });
  });

  it('discards stale table wording left behind on an appointments venue', () => {
    expect(
      mergeVenueTerminology('unified_scheduling', {
        client: 'Guest',
        booking: 'Reservation',
        staff: 'Staff',
      }),
    ).toEqual({ client: 'Client', booking: 'Appointment', staff: 'Staff' });
  });

  it('respects words the venue actually chose', () => {
    expect(
      mergeVenueTerminology('practitioner_appointment', {
        client: 'Patient',
        booking: 'Session',
        staff: 'Therapist',
      }),
    ).toEqual({ client: 'Patient', booking: 'Session', staff: 'Therapist' });
  });

  it('leaves a chosen word alone even when it matches another model’s default', () => {
    // "Booking" is the event/class/resource default but not the table one, so it
    // is a choice here, not drift.
    expect(mergeVenueTerminology('unified_scheduling', { booking: 'Booking' } as never).booking).toBe(
      'Booking',
    );
  });

  it('drifted and chosen words are resolved independently, key by key', () => {
    expect(
      mergeVenueTerminology('unified_scheduling', {
        client: 'Patient',
        booking: 'Reservation',
        staff: 'Staff',
      }),
    ).toEqual({ client: 'Patient', booking: 'Appointment', staff: 'Staff' });
  });

  it('treats a blank stored word as absent', () => {
    expect(
      mergeVenueTerminology('unified_scheduling', {
        client: '   ',
        booking: '',
        staff: 'Staff',
      }),
    ).toEqual({ client: 'Client', booking: 'Appointment', staff: 'Staff' });
  });

  it('covers every booking model with a default', () => {
    const models = [
      'table_reservation',
      'practitioner_appointment',
      'unified_scheduling',
      'event_ticket',
      'class_session',
      'resource_booking',
    ] as const;
    for (const model of models) {
      const words = mergeVenueTerminology(model, null);
      expect(words.client.length).toBeGreaterThan(0);
      expect(words.booking.length).toBeGreaterThan(0);
      expect(words.staff.length).toBeGreaterThan(0);
    }
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
  it('says "New booking" on an appointment venue', () => {
    // The default term is "Reservation", which suits a restaurant but read as
    // "New reservation" in a salon or barber.
    expect(newBookingActionLabel(null, true)).toBe('New booking');
  });

  it('keeps the reservation default for a table venue', () => {
    expect(newBookingActionLabel(null, false)).toBe('New reservation');
  });

  it('lets a venue term the venue set itself win either way', () => {
    expect(newBookingActionLabel({ booking: 'Booking' } as never, false)).toBe('New booking');
    expect(newBookingActionLabel({ booking: 'Visit' } as never, true)).toBe('New visit');
    expect(newBookingActionLabel({ booking: 'Consultation' } as never, true)).toBe(
      'New consultation',
    );
  });

  it('treats "Appointment" as a default, not a choice (R12-4)', () => {
    /**
     * This expectation flipped when terminology became model-aware. "Appointment"
     * used to prove the venue had typed something, because the default for every
     * venue was "Reservation". It is now the DEFAULT that appointments venues
     * carry — the web changed its stored default the same way (20270103124000) —
     * so reading it as a choice would make the "New booking" branch unreachable
     * for exactly the venues it was written for.
     */
    expect(newBookingActionLabel({ booking: 'Appointment' } as never, true)).toBe('New booking');
  });

  it('treats the merged-in default as "not customised"', () => {
    /**
     * The regression test for why this stayed broken on device. VenueProvider
     * spreads DEFAULT_TERMINOLOGY in before anything reads it, so `booking` is
     * ALWAYS a string — an implementation that treats "a term is present" as
     * "the venue chose it" never reaches the appointment branch, and every
     * venue keeps reading "New reservation".
     */
    expect(newBookingActionLabel({ booking: 'Reservation' } as never, true)).toBe('New booking');
    expect(newBookingActionLabel({ booking: 'reservation' } as never, true)).toBe('New booking');
    expect(newBookingActionLabel({ booking: 'Reservation' } as never, false)).toBe(
      'New reservation',
    );
  });

  it('ignores a blank term rather than rendering "New "', () => {
    expect(newBookingActionLabel({ booking: '  ' } as never, true)).toBe('New booking');
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
