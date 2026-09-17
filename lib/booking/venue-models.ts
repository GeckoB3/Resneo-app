/**
 * Which booking models a venue has switched on, as the web resolves them
 * (`src/lib/booking/active-models.ts` `resolveActiveBookingModels`): an explicit
 * `active_booking_models` list wins; an empty or missing one falls back to the
 * primary model plus `enabled_models`.
 *
 * Web's rule since 2026-09-17: rooms and other resources, classes and events appear
 * on the calendar settings only while their model is on. A room calendar left over
 * from when resources were switched on is not a calendar that offers anything.
 */
import type { BookingModel } from '@/types/venue';

export interface VenueModelFields {
  booking_model?: BookingModel | null;
  active_booking_models?: readonly BookingModel[] | null;
  enabled_models?: readonly BookingModel[] | null;
}

export function venueActiveModels(venue: VenueModelFields | null | undefined): Set<BookingModel> {
  if (!venue) return new Set();
  const explicit = venue.active_booking_models ?? [];
  if (explicit.length > 0) return new Set(explicit);
  return new Set([...(venue.booking_model ? [venue.booking_model] : []), ...(venue.enabled_models ?? [])]);
}

export interface CalendarSetupSections {
  classes: boolean;
  resources: boolean;
  events: boolean;
}

/**
 * The calendar settings sections to show. Before the venue has loaded every section
 * shows, so nothing flickers away and back.
 */
export function calendarSetupSections(venue: VenueModelFields | null | undefined): CalendarSetupSections {
  if (!venue) return { classes: true, resources: true, events: true };
  const models = venueActiveModels(venue);
  return {
    classes: models.has('class_session'),
    resources: models.has('resource_booking'),
    events: models.has('event_ticket'),
  };
}
