/**
 * What a class or resource booking can be moved to, from the STAFF routes the
 * web's modify forms use (web `StaffClassModifyInstancePicker`,
 * `StaffResourceBookingModifySlotPicker`). The public `/api/booking/*` routes
 * the new-booking form reads hide sessions inside the notice window and count
 * the booking being moved as taken, so they cannot answer "where can this go".
 */
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { ClassOfferingsResponse, ResourceAvailabilityResponse } from '@/types/booking-offerings';

const moveKeys = {
  classSessions: (from: string | null, ownerVenueId: string | null) =>
    [...queryKeys.appointments.all(), 'moveClassSessions', from, ownerVenueId] as const,
  resourceMonth: (
    resourceId: string | null,
    month: string | null,
    duration: number | null,
    bookingId: string | null,
  ) => [...queryKeys.appointments.all(), 'moveResourceMonth', resourceId, month, duration, bookingId] as const,
  resourceDay: (
    resourceId: string | null,
    date: string | null,
    duration: number | null,
    bookingId: string | null,
  ) => [...queryKeys.appointments.all(), 'moveResourceDay', resourceId, date, duration, bookingId] as const,
};

/** GET /api/venue/class-offerings: every session in the next 90 days, with places left. */
export function useStaffClassSessions(
  from: string | null,
  { ownerVenueId = null, enabled = true }: { ownerVenueId?: string | null; enabled?: boolean } = {},
) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: moveKeys.classSessions(from, ownerVenueId),
    enabled: enabled && isBackendConfigured() && !!accessToken && !!from,
    queryFn: async (): Promise<ClassOfferingsResponse> => {
      const params = new URLSearchParams({ from: from ?? '', days: '90' });
      if (ownerVenueId) params.set('owner_venue_id', ownerVenueId);
      return apiFetch<ClassOfferingsResponse>(`/api/venue/class-offerings?${params.toString()}`, {
        accessToken: accessToken ?? undefined,
      });
    },
  });
}

/**
 * GET /api/venue/resource-calendar: the days in a month with room for this
 * booking at `durationMinutes`, not counting the booking itself.
 */
export function useStaffResourceMonth(args: {
  resourceId: string | null;
  /** Any date in the month, YYYY-MM-DD. */
  monthAnchor: string | null;
  durationMinutes: number | null;
  excludeBookingId: string | null;
  enabled?: boolean;
}) {
  const accessToken = useAccessToken();
  const month = args.monthAnchor?.slice(0, 7) ?? null;
  return useQuery({
    queryKey: moveKeys.resourceMonth(args.resourceId, month, args.durationMinutes, args.excludeBookingId),
    enabled:
      (args.enabled ?? true) &&
      isBackendConfigured() &&
      !!accessToken &&
      !!args.resourceId &&
      !!month &&
      !!args.durationMinutes,
    queryFn: async (): Promise<{ available_dates: string[] }> => {
      const [year, monthNum] = (month ?? '').split('-');
      const params = new URLSearchParams({
        resource_id: args.resourceId ?? '',
        year: String(Number(year)),
        month: String(Number(monthNum)),
        duration: String(args.durationMinutes),
        skip_past_slots: '1',
      });
      if (args.excludeBookingId) params.set('exclude_booking_id', args.excludeBookingId);
      return apiFetch<{ available_dates: string[] }>(`/api/venue/resource-calendar?${params.toString()}`, {
        accessToken: accessToken ?? undefined,
      });
    },
  });
}

/** GET /api/venue/resource-availability: start times for this booking on a day, not counting itself. */
export function useStaffResourceDay(args: {
  resourceId: string | null;
  date: string | null;
  durationMinutes: number | null;
  excludeBookingId: string | null;
  enabled?: boolean;
}) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: moveKeys.resourceDay(args.resourceId, args.date, args.durationMinutes, args.excludeBookingId),
    enabled:
      (args.enabled ?? true) &&
      isBackendConfigured() &&
      !!accessToken &&
      !!args.resourceId &&
      !!args.date &&
      !!args.durationMinutes,
    queryFn: async (): Promise<ResourceAvailabilityResponse> => {
      const params = new URLSearchParams({
        date: args.date ?? '',
        duration: String(args.durationMinutes),
        resource_id: args.resourceId ?? '',
        skip_past_slots: '1',
      });
      if (args.excludeBookingId) params.set('exclude_booking_id', args.excludeBookingId);
      return apiFetch<ResourceAvailabilityResponse>(
        `/api/venue/resource-availability?${params.toString()}`,
        { accessToken: accessToken ?? undefined },
      );
    },
  });
}
