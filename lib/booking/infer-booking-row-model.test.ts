import {
  bookingModelShortLabel,
  bookingSeatedStatusDisplayLabel,
  bookingStatusDisplayLabel,
  inferBookingRowModel,
  isTableReservationBooking,
} from '@/lib/booking/infer-booking-row-model';

/**
 * Booking-model inference (pure). Mirrors the web `inferBookingRowModel` —
 * derive a canonical booking model from whichever id columns a list/detail row
 * carries, then map that to short labels / status display copy.
 */

describe('inferBookingRowModel', () => {
  it('trusts an explicit, valid booking_model', () => {
    expect(inferBookingRowModel({ booking_model: 'class_session' })).toBe('class_session');
    expect(inferBookingRowModel({ booking_model: 'event_ticket' })).toBe('event_ticket');
  });

  it('ignores an invalid booking_model and falls through to id-based inference', () => {
    expect(inferBookingRowModel({ booking_model: 'nonsense', resource_id: 'r1' })).toBe('resource_booking');
  });

  it('infers each model from its distinguishing id (in priority order)', () => {
    expect(inferBookingRowModel({ experience_event_id: 'e1' })).toBe('event_ticket');
    expect(inferBookingRowModel({ class_instance_id: 'c1' })).toBe('class_session');
    expect(inferBookingRowModel({ resource_id: 'r1' })).toBe('resource_booking');
    expect(inferBookingRowModel({ event_session_id: 's1' })).toBe('unified_scheduling');
    expect(inferBookingRowModel({ calendar_id: 'cal1', service_item_id: 'si1' })).toBe('unified_scheduling');
    expect(inferBookingRowModel({ practitioner_id: 'p1', appointment_service_id: 'as1' })).toBe(
      'practitioner_appointment',
    );
  });

  it('defaults to table_reservation when no id matches', () => {
    expect(inferBookingRowModel({})).toBe('table_reservation');
    // calendar_id alone (no service_item_id) is not enough for unified_scheduling.
    expect(inferBookingRowModel({ calendar_id: 'cal1' })).toBe('table_reservation');
    // practitioner_id alone (no appointment_service_id) is not enough.
    expect(inferBookingRowModel({ practitioner_id: 'p1' })).toBe('table_reservation');
  });

  it('prefers experience_event_id over later id signals', () => {
    expect(inferBookingRowModel({ experience_event_id: 'e1', resource_id: 'r1' })).toBe('event_ticket');
  });
});

describe('isTableReservationBooking', () => {
  it('uses a precomputed inferred_booking_model when present', () => {
    expect(isTableReservationBooking({ inferred_booking_model: 'table_reservation' })).toBe(true);
    expect(isTableReservationBooking({ inferred_booking_model: 'class_session' })).toBe(false);
  });

  it('falls back to inference when inferred_booking_model is absent', () => {
    expect(isTableReservationBooking({})).toBe(true);
    expect(isTableReservationBooking({ resource_id: 'r1' })).toBe(false);
  });
});

describe('bookingSeatedStatusDisplayLabel', () => {
  it('says "Seated" for dining and "Started" otherwise', () => {
    expect(bookingSeatedStatusDisplayLabel(true)).toBe('Seated');
    expect(bookingSeatedStatusDisplayLabel(false)).toBe('Started');
  });
});

describe('bookingStatusDisplayLabel', () => {
  it('rewrites the Seated status per venue type', () => {
    expect(bookingStatusDisplayLabel('Seated', true)).toBe('Seated');
    expect(bookingStatusDisplayLabel('Seated', false)).toBe('Started');
  });

  it('passes through any non-Seated status unchanged', () => {
    expect(bookingStatusDisplayLabel('Confirmed', true)).toBe('Confirmed');
    expect(bookingStatusDisplayLabel('Confirmed', false)).toBe('Confirmed');
    expect(bookingStatusDisplayLabel('No-Show', false)).toBe('No-Show');
  });
});

describe('bookingModelShortLabel', () => {
  it('maps each model to its short label', () => {
    expect(bookingModelShortLabel('table_reservation')).toBe('Table');
    expect(bookingModelShortLabel('practitioner_appointment')).toBe('Appointment');
    expect(bookingModelShortLabel('unified_scheduling')).toBe('Appointment');
    expect(bookingModelShortLabel('event_ticket')).toBe('Event');
    expect(bookingModelShortLabel('class_session')).toBe('Class');
    expect(bookingModelShortLabel('resource_booking')).toBe('Resource');
  });

  it('passes an unknown model string through unchanged', () => {
    expect(bookingModelShortLabel('mystery_model')).toBe('mystery_model');
  });
});
