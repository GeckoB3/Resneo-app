/**
 * Where a booking came from, in the words staff use (web #190
 * `guestBookingSourceLabel`, `GuestBookingsForGuestAccordion.tsx`). The raw
 * `bookings.source` values are storage names (`booking_page`, `walk-in`); the
 * booking panel used to show them as they were. One helper for every booking
 * surface, so a client's history reads "Online, Phone, Walk-in" at a glance.
 * The reports CSV keeps its own map (`lib/reports/csv-export.ts`), which
 * mirrors the web's export rather than its panel.
 */
export function bookingSourceLabel(source: string | null | undefined): string | null {
  const raw = typeof source === 'string' ? source.trim().toLowerCase() : '';
  if (!raw) return null;
  if (raw === 'booking_page' || raw === 'online' || raw === 'widget' || raw === 'public' || raw === 'web') {
    return 'Online';
  }
  if (raw === 'walk-in' || raw === 'walk_in' || raw === 'walkin') return 'Walk-in';
  if (raw === 'phone') return 'Phone';
  if (raw === 'staff') return 'Staff';
  if (raw === 'recurring') return 'Recurring';
  const words = raw.replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
