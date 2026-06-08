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

export function newBookingActionLabel(terminology: VenueTerminology | null | undefined): string {
  const booking = mergeTerminology(terminology).booking;
  return `New ${booking.toLowerCase()}`;
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

export function clientsScreenTitle(terminology: VenueTerminology | null | undefined): string {
  return mergeTerminology(terminology).client + 's';
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
