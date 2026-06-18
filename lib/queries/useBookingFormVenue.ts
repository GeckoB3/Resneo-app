import { ApiError } from '@/lib/api/client';
import { useLinkedVenueProfile } from '@/lib/queries/useLinkedCalendar';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { useVenueContext } from '@/providers/VenueProvider';

/**
 * The venue the new-booking form is operating on — the staff's own venue, or a
 * linked ("owner") venue when one is active.
 *
 * Linked-venue booking creation reuses the SAME wizard as the native flow
 * (mirrors the web `StaffSurfaceBookingStack` + `linkedOwnerVenueId`): the
 * catalog/offerings come from the linked venue's public, `venue_id`-keyed
 * endpoints, availability/create carry `owner_venue_id`, and the form is framed
 * by the linked venue's booking models + timezone. The linked profile fetch is
 * itself gated on `create_edit_cancel` server-side, so a 403 here IS the
 * permission check — the caller blocks the form when `isForbidden`.
 */
export interface BookingFormVenue {
  /** Effective venue id for catalog/offerings lookups (own or linked). */
  venueId: string | null;
  venueName: string | null;
  timeZone: string;
  currency: string;
  /** Union of the venue's enabled/active booking models (string-compared). */
  enabledModels: string[];
  bookingModel: string | null;
  /** Own-venue plan tier (drives appointment exposure); null for linked. */
  pricingTier: string | null;
  /** Whether the "any available practitioner" option is offered. */
  anyAvailableEnabled: boolean;
  /** True when scoping to a linked owner venue rather than the own venue. */
  isLinked: boolean;
  ownerVenueId: string | null;
  /** Linked profile still loading (own venue is never loading here). */
  isLoading: boolean;
  /** Link does not grant create permission (403) — the form must be blocked. */
  isForbidden: boolean;
  /** A non-permission profile load error, if any. */
  error: string | null;
}

export function useBookingFormVenue(): BookingFormVenue {
  const { venue, featureFlags, isLoading: venueLoading } = useVenueContext();
  const { ownerVenueId: rawOwner, ownerVenueName } = useLinkedVenueContext();

  // A linked id that matches our own venue is just the own venue.
  const ownerVenueId = rawOwner && rawOwner !== venue?.id ? rawOwner : null;
  const profile = useLinkedVenueProfile(ownerVenueId);

  if (!ownerVenueId) {
    return {
      venueId: venue?.id ?? null,
      venueName: venue?.name ?? null,
      timeZone: venue?.timezone ?? 'Europe/London',
      currency: venue?.currency ?? 'GBP',
      enabledModels: [
        ...(venue?.active_booking_models ?? []),
        ...(venue?.enabled_models ?? []),
      ],
      bookingModel: venue?.booking_model ?? null,
      pricingTier: venue?.pricing_tier ?? null,
      anyAvailableEnabled: Boolean(featureFlags?.resolved?.any_available_practitioner),
      isLinked: false,
      ownerVenueId: null,
      isLoading: venueLoading,
      isForbidden: false,
      error: null,
    };
  }

  const data = profile.data;
  const profileVenue = (data?.venue ?? {}) as Record<string, unknown>;
  const isForbidden = profile.error instanceof ApiError && profile.error.status === 403;
  const otherError =
    !isForbidden && profile.error
      ? profile.error instanceof ApiError
        ? profile.error.message
        : 'Could not load the linked venue.'
      : null;

  return {
    venueId: ownerVenueId,
    venueName: ownerVenueName ?? data?.venue_name ?? null,
    timeZone:
      typeof profileVenue.timezone === 'string' && profileVenue.timezone.trim() !== ''
        ? (profileVenue.timezone as string)
        : 'Europe/London',
    currency: data?.currency ?? 'GBP',
    enabledModels: data?.enabled_models ?? [],
    bookingModel: data?.booking_model ?? null,
    // Linked venues have no plan-tier gate; tab exposure comes from enabled
    // models alone (the server's resolved venue mode).
    pricingTier: null,
    // Pooled "any available practitioner" is not offered when booking into a
    // linked venue (mirrors the web, which scopes it to the own venue).
    anyAvailableEnabled: false,
    isLinked: true,
    ownerVenueId,
    isLoading: profile.isLoading,
    isForbidden,
    error: otherError,
  };
}
