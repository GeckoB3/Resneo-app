/**
 * The restaurant (table reservation) product was retired on 27 November 2026 (web decision D10).
 * Mirrors the web's `src/lib/restaurant-retired.ts`: a venue row that still describes the
 * restaurant product sees a plain message instead of the app.
 */

/** Pricing tiers that belonged to the restaurant product. */
const RESTAURANT_PRODUCT_TIERS = new Set(['restaurant', 'founding']);

/** Appointments product tiers: these venues keep working even if `booking_model` is the old default. */
const APPOINTMENT_TIERS = new Set(['appointments', 'plus', 'light']);

/** Shown to staff of a venue still set up for table bookings (the web's wording). */
export const RESTAURANT_RETIRED_STAFF_MESSAGE =
  'Table bookings are no longer part of ResNeo, so this business cannot be managed here. Please contact support and we will help you move onto an Appointments plan.';

/**
 * True when the venue row still describes the retired restaurant product: a restaurant or
 * Founding Partner tier, or a `table_reservation` booking model outside the Appointments tiers.
 */
export function isRetiredRestaurantVenue(
  venue: { booking_model?: string | null; pricing_tier?: string | null } | null | undefined,
): boolean {
  if (!venue) return false;
  const tier = (venue.pricing_tier ?? '').toLowerCase().trim();
  if (RESTAURANT_PRODUCT_TIERS.has(tier)) return true;
  return venue.booking_model === 'table_reservation' && !APPOINTMENT_TIERS.has(tier);
}
