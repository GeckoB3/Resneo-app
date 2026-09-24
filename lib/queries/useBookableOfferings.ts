/**
 * Bookable-offering queries for the multi-model new-booking form.
 *
 * These read the PUBLIC `/api/booking/*` endpoints (admin-backed server-side,
 * keyed by venue_id) — the same endpoints the web staff booking flow uses to
 * list bookable classes/events/resources. The access token is passed when
 * present (harmless; the routes don't require it).
 *
 * The exception is booking for a live collective (E-5, web 2026-09-23): classes
 * and events then come from the STAFF routes `/api/venue/class-offerings` and
 * `/api/venue/event-offerings` with `owner_venue_id` = the collective, as the
 * web staff flow reads them (`booking-flow-api.ts`). Those add this venue's own
 * classes and events that are not listed on the combined page, tagged with the
 * venue and no `collective_listing_id`, which the public combined page leaves out.
 */

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  ClassOfferingsResponse,
  EventOfferingsResponse,
  ResourceAvailabilityResponse,
  ResourceOptionsResponse,
} from '@/types/booking-offerings';

/** Local key factory — nests under the appointments root so it shares scoping. */
const bookableKeys = {
  classOfferings: (venueId?: string | null, from?: string | null, days?: number) =>
    [...queryKeys.appointments.all(), 'classOfferings', venueId ?? null, from ?? null, days ?? null] as const,
  eventOfferings: (venueId?: string | null, from?: string | null, days?: number) =>
    [...queryKeys.appointments.all(), 'eventOfferings', venueId ?? null, from ?? null, days ?? null] as const,
  /** The staff routes answer differently from the public one (own unlisted items), so they key apart. */
  staffCollectiveOfferings: (
    kind: 'class' | 'event',
    collectiveId?: string | null,
    from?: string | null,
    days?: number,
  ) =>
    [
      ...queryKeys.appointments.all(),
      'staffCollectiveOfferings',
      kind,
      collectiveId ?? null,
      from ?? null,
      days ?? null,
    ] as const,
  resourceOptions: (venueId?: string | null) =>
    [...queryKeys.appointments.all(), 'resourceOptions', venueId ?? null] as const,
  resourceAvailability: (
    venueId?: string | null,
    date?: string | null,
    resourceId?: string | null,
    duration?: number | null,
  ) =>
    [
      ...queryKeys.appointments.all(),
      'resourceAvailability',
      venueId ?? null,
      date ?? null,
      resourceId ?? null,
      duration ?? null,
    ] as const,
};

interface OfferingWindow {
  /** Start date YYYY-MM-DD (defaults server-side to today when omitted). */
  from?: string | null;
  /** Days ahead to include (server clamps 7–120; default 90). */
  days?: number;
  /**
   * The live collective the form is booking for, when it is (E-5). Reads the
   * staff route with `owner_venue_id` set to it instead of the public combined
   * page, so this venue's own unlisted items are offered too. Needs a signed-in
   * staff member; null or omitted keeps the public route.
   */
  staffCollectiveId?: string | null;
}

/**
 * The staff offerings path for a collective, matching the web staff flow's
 * `classOfferingsUrl` / `eventOfferingsUrl` (`from`, `days`, `owner_venue_id`).
 */
export function staffCollectiveOfferingsPath(
  kind: 'class' | 'event',
  collectiveId: string,
  from: string | null,
  days: number,
): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  params.set('days', String(days));
  params.set('owner_venue_id', collectiveId);
  return `/api/venue/${kind}-offerings?${params.toString()}`;
}

/** Bookable class types + their scheduled sessions for the window. */
export function useClassOfferings(venueId: string | null | undefined, window: OfferingWindow = {}) {
  const { from = null, days = 90, staffCollectiveId = null } = window;
  const accessToken = useAccessToken();
  const enabled = staffCollectiveId
    ? isBackendConfigured() && Boolean(accessToken)
    : isBackendConfigured() && Boolean(venueId);

  return useQuery({
    queryKey: staffCollectiveId
      ? bookableKeys.staffCollectiveOfferings('class', staffCollectiveId, from, days)
      : bookableKeys.classOfferings(venueId, from, days),
    enabled,
    queryFn: async (): Promise<ClassOfferingsResponse> => {
      if (staffCollectiveId) {
        return apiFetch<ClassOfferingsResponse>(staffCollectiveOfferingsPath('class', staffCollectiveId, from, days), {
          accessToken: accessToken ?? undefined,
        });
      }
      if (!venueId) throw new Error('Missing venue id');
      const params = new URLSearchParams({ venue_id: venueId, days: String(days) });
      if (from) params.set('from', from);
      return apiFetch<ClassOfferingsResponse>(
        `/api/booking/class-offerings?${params.toString()}`,
        accessToken ? { accessToken } : {},
      );
    },
  });
}

/** Bookable event series + their occurrences (with ticket types) for the window. */
export function useEventOfferings(venueId: string | null | undefined, window: OfferingWindow = {}) {
  const { from = null, days = 90, staffCollectiveId = null } = window;
  const accessToken = useAccessToken();
  const enabled = staffCollectiveId
    ? isBackendConfigured() && Boolean(accessToken)
    : isBackendConfigured() && Boolean(venueId);

  return useQuery({
    queryKey: staffCollectiveId
      ? bookableKeys.staffCollectiveOfferings('event', staffCollectiveId, from, days)
      : bookableKeys.eventOfferings(venueId, from, days),
    enabled,
    queryFn: async (): Promise<EventOfferingsResponse> => {
      if (staffCollectiveId) {
        return apiFetch<EventOfferingsResponse>(staffCollectiveOfferingsPath('event', staffCollectiveId, from, days), {
          accessToken: accessToken ?? undefined,
        });
      }
      if (!venueId) throw new Error('Missing venue id');
      const params = new URLSearchParams({ venue_id: venueId, days: String(days) });
      if (from) params.set('from', from);
      return apiFetch<EventOfferingsResponse>(
        `/api/booking/event-offerings?${params.toString()}`,
        accessToken ? { accessToken } : {},
      );
    },
  });
}

/** Bookable resources (metadata only — slots come from useResourceAvailability). */
export function useResourceOptions(venueId: string | null | undefined) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && Boolean(venueId);

  return useQuery({
    queryKey: bookableKeys.resourceOptions(venueId),
    enabled,
    queryFn: async (): Promise<ResourceOptionsResponse> => {
      if (!venueId) throw new Error('Missing venue id');
      const params = new URLSearchParams({ venue_id: venueId });
      return apiFetch<ResourceOptionsResponse>(
        `/api/booking/resource-options?${params.toString()}`,
        accessToken ? { accessToken } : {},
      );
    },
  });
}

interface ResourceAvailabilityArgs {
  date: string | null;
  resourceId: string | null;
  durationMinutes: number | null;
}

/** Bookable start times for one resource on a date, for a chosen duration. */
export function useResourceAvailability(
  venueId: string | null | undefined,
  { date, resourceId, durationMinutes }: ResourceAvailabilityArgs,
) {
  const accessToken = useAccessToken();
  const enabled =
    isBackendConfigured() &&
    Boolean(venueId) &&
    Boolean(date) &&
    Boolean(resourceId) &&
    Boolean(durationMinutes && durationMinutes > 0);

  return useQuery({
    queryKey: bookableKeys.resourceAvailability(venueId, date, resourceId, durationMinutes),
    enabled,
    queryFn: async (): Promise<ResourceAvailabilityResponse> => {
      if (!venueId || !date || !resourceId || !durationMinutes) {
        throw new Error('Missing resource availability inputs');
      }
      const params = new URLSearchParams({
        venue_id: venueId,
        date,
        booking_model: 'resource_booking',
        resource_id: resourceId,
        duration: String(durationMinutes),
      });
      return apiFetch<ResourceAvailabilityResponse>(
        `/api/booking/availability?${params.toString()}`,
        accessToken ? { accessToken } : {},
      );
    },
  });
}
