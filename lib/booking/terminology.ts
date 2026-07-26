import type { VenueTerminology } from '@/types/venue';

const DEFAULTS: VenueTerminology = {
  client: 'Guest',
  booking: 'Reservation',
  staff: 'Staff',
};

export function mergeTerminology(
  terminology: VenueTerminology | null | undefined,
): VenueTerminology {
  return { ...DEFAULTS, ...(terminology ?? {}) };
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
 * Label for the "create" entry points (the calendar/bookings FAB and the add
 * sheet).
 *
 * The default booking term is "Reservation", which suits a restaurant but read
 * as "New reservation" on appointment venues — the odd one out in this file,
 * since `todaySectionTitle`, `bookingsScreenTitle` and `partySizeLabel` all
 * already branch on `isAppointment`. Appointment venues now get "New booking".
 *
 * "Booking" rather than "appointment" on purpose: this entry point opens a
 * wizard that also creates classes, events and resource bookings, so the
 * broader term is the accurate one.
 *
 * A venue that has chosen its own booking term still wins — that is the venue
 * speaking, not the default. A barber set up through the web onboarding gets
 * "Appointment", for instance, and keeps it.
 *
 * Note it CANNOT test "did the caller pass a term?": `VenueProvider` merges
 * `DEFAULT_TERMINOLOGY` in before anything reads it, so `booking` is always a
 * string. A value equal to the default means "not customised". Getting that
 * wrong made the appointment branch below unreachable and every venue kept
 * reading "New reservation".
 */
export function newBookingActionLabel(
  terminology: VenueTerminology | null | undefined,
  isAppointment: boolean,
): string {
  const term = terminology?.booking?.trim();
  const customised = !!term && term.toLowerCase() !== DEFAULTS.booking.toLowerCase();
  if (customised) return `New ${term.toLowerCase()}`;
  if (isAppointment) return 'New booking';
  return `New ${DEFAULTS.booking.toLowerCase()}`;
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
