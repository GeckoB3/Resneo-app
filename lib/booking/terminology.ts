import type { BookingModel, VenueTerminology } from '@/types/venue';

/**
 * Per-model default wording — port of the web `DEFAULT_TERMINOLOGY`
 * (`src/types/booking-models.ts`). `area` is omitted deliberately: nothing in
 * the app reads it, and adding it would only widen every merged object.
 */
export const DEFAULT_TERMINOLOGY: Record<BookingModel, VenueTerminology> = {
  table_reservation: { client: 'Guest', booking: 'Reservation', staff: 'Staff' },
  practitioner_appointment: { client: 'Client', booking: 'Appointment', staff: 'Staff' },
  unified_scheduling: { client: 'Client', booking: 'Appointment', staff: 'Staff' },
  event_ticket: { client: 'Guest', booking: 'Booking', staff: 'Host' },
  class_session: { client: 'Member', booking: 'Booking', staff: 'Instructor' },
  resource_booking: { client: 'Booker', booking: 'Booking', staff: 'Manager' },
};

const TABLE_WORDS = DEFAULT_TERMINOLOGY.table_reservation;

/**
 * A venue's terminology is written once, at signup, from the business type it
 * picked. Nothing rewrites it if the venue later moves to a different booking
 * model, so one that started as a restaurant and now takes appointments still
 * carries "Reservation" and "Guest".
 *
 * A stored word that is simply the table-booking default is drift of that kind
 * rather than a choice anyone made, so on any other model the model's own
 * default wins. Words a venue genuinely picked — including ones that happen to
 * match another model's default, like "Booking" — are left alone.
 *
 * Port of the web `resolveWord` in `src/lib/dashboard/merge-venue-terminology.ts`;
 * keep the two in step.
 */
function resolveWord(
  model: BookingModel,
  key: keyof VenueTerminology,
  stored: string | undefined,
  base: string,
): string {
  if (typeof stored !== 'string' || stored.trim() === '') return base;
  const isStaleTableWord = model !== 'table_reservation' && stored === TABLE_WORDS[key];
  return isStaleTableWord ? base : stored;
}

/**
 * Merge a venue's stored terminology over its model's defaults. This is the one
 * to use when the booking model is known — `VenueProvider` calls it so every
 * screen downstream reads model-correct wording.
 */
export function mergeVenueTerminology(
  model: BookingModel,
  terminology: VenueTerminology | null | undefined,
): VenueTerminology {
  const base = DEFAULT_TERMINOLOGY[model] ?? TABLE_WORDS;
  if (!terminology || typeof terminology !== 'object') return { ...base };
  return {
    client: resolveWord(model, 'client', terminology.client, base.client),
    booking: resolveWord(model, 'booking', terminology.booking, base.booking),
    staff: resolveWord(model, 'staff', terminology.staff, base.staff),
  };
}

/**
 * Model-blind merge, kept for the two title helpers below whose non-appointment
 * branch has no model to hand. Real values reach them already merged by
 * `VenueProvider`, so this only fills gaps; the table defaults are the right
 * last resort there because that branch is by definition not an appointments
 * venue.
 *
 * Prefer {@link mergeVenueTerminology} anywhere the booking model is known.
 */
export function mergeTerminology(
  terminology: VenueTerminology | null | undefined,
): VenueTerminology {
  return { ...TABLE_WORDS, ...(terminology ?? {}) };
}

/** Plural party label — web uses covers vs guests vs people by venue mode. */
export function partySizeLabel(
  partySize: number,
  options: { isAppointment: boolean; isTableReservation?: boolean },
): string {
  const n = partySize;
  if (options.isAppointment && !options.isTableReservation) {
    return `${n} guest${n !== 1 ? 's' : ''}`;
  }
  if (!options.isAppointment) {
    return `${n} cover${n !== 1 ? 's' : ''}`;
  }
  return `${n} guest${n !== 1 ? 's' : ''}`;
}

/**
 * Every booking word that is a MODEL DEFAULT rather than something a venue
 * typed — "Reservation", "Appointment", "Booking". Membership is the test for
 * "did the venue choose this?", and it has to be the whole set rather than one
 * word: since terminology is resolved per booking model, the default an
 * appointments venue carries is "Appointment", not "Reservation".
 */
const DEFAULT_BOOKING_WORDS = new Set(
  Object.values(DEFAULT_TERMINOLOGY).map((t) => t.booking.toLowerCase()),
);

/**
 * Label for the "create" entry points (the calendar/bookings FAB and the add
 * sheet).
 *
 * Appointment venues get "New booking" — "Booking" rather than "appointment" on
 * purpose, because this entry point opens a wizard that also creates classes,
 * events and resource bookings, so the broader term is the accurate one.
 *
 * A venue that has chosen its own booking term still wins — that is the venue
 * speaking, not the default.
 *
 * Note it CANNOT test "did the caller pass a term?": `VenueProvider` merges the
 * model defaults in before anything reads it, so `booking` is always a string.
 * A value equal to a default means "not customised". Getting that wrong made the
 * appointment branch unreachable and every venue read "New reservation".
 *
 * The same trap, inverted, is why the check is a SET (R12-4). It used to compare
 * against "Reservation" alone, which worked only while that was the default for
 * everyone. Now that an appointments venue defaults to "Appointment", comparing
 * against one word would read the default back as a deliberate choice and every
 * such venue would say "New appointment".
 */
export function newBookingActionLabel(
  terminology: VenueTerminology | null | undefined,
  isAppointment: boolean,
): string {
  const term = terminology?.booking?.trim();
  const chosenByVenue = !!term && !DEFAULT_BOOKING_WORDS.has(term.toLowerCase());
  if (chosenByVenue) return `New ${term.toLowerCase()}`;
  if (isAppointment) return 'New booking';
  return `New ${(term || TABLE_WORDS.booking).toLowerCase()}`;
}

export function todaySectionTitle(
  terminology: VenueTerminology | null | undefined,
  isAppointment: boolean,
): string {
  const booking = mergeTerminology(terminology).booking;
  if (isAppointment) {
    return `Today's appointments`;
  }
  return `Today's ${booking.toLowerCase()}s`;
}

/** The CRM tab/page is always "Contacts", mirroring the web dashboard nav. */
export function clientsScreenTitle(_terminology?: VenueTerminology | null | undefined): string {
  return 'Contacts';
}

/**
 * Title for the Bookings tab/list. Appointment venues say "Appointments";
 * others pluralise their booking term ("Reservations", "Bookings").
 */
export function bookingsScreenTitle(
  terminology: VenueTerminology | null | undefined,
  isAppointment: boolean,
): string {
  if (isAppointment) {
    return 'Appointments';
  }
  return mergeTerminology(terminology).booking + 's';
}
