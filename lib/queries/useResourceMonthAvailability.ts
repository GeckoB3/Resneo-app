import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export interface ResourceMonthAvailabilityResponse {
  venue_id: string;
  resource_id: string;
  year: number;
  month: number;
  duration_minutes: number | null;
  duration_mode: 'any' | 'fixed';
  available_dates: string[];
}

/**
 * GET /api/booking/resource-calendar — which dates in a month have at least one
 * bookable slot for a resource. Feeds green dots on the resource date picker
 * (web parity with `ResourceCalendarMonth`).
 *
 * When `durationMinutes` is set the dates are those that can fit exactly that
 * length; otherwise `duration=any` marks days where *any* valid duration fits
 * (aligned with the staff calendar). Public route — token forwarded harmlessly.
 */
export function useResourceMonthAvailability({
  venueId,
  resourceId,
  year,
  month,
  durationMinutes,
  enabled = true,
}: {
  venueId: string | null | undefined;
  resourceId: string | null | undefined;
  year: number;
  /** 1–12. */
  month: number;
  /** When set, dates that fit exactly this length; otherwise any valid duration. */
  durationMinutes?: number | null;
  enabled?: boolean;
}) {
  const accessToken = useAccessToken();
  const durationKey = durationMinutes ?? 'any';
  const queryEnabled =
    enabled && isBackendConfigured() && Boolean(venueId) && Boolean(resourceId);

  return useQuery({
    queryKey: [
      ...queryKeys.appointments.all(),
      'resourceMonthAvailability',
      venueId ?? null,
      resourceId ?? null,
      year,
      month,
      durationKey,
    ] as const,
    enabled: queryEnabled,
    queryFn: async (): Promise<ResourceMonthAvailabilityResponse> => {
      if (!venueId || !resourceId) {
        throw new Error('Missing resource month availability parameters');
      }
      const params = new URLSearchParams({
        venue_id: venueId,
        resource_id: resourceId,
        year: String(year),
        month: String(month),
        duration: durationMinutes != null ? String(durationMinutes) : 'any',
      });
      return apiFetch<ResourceMonthAvailabilityResponse>(
        `/api/booking/resource-calendar?${params.toString()}`,
        accessToken ? { accessToken } : {},
      );
    },
  });
}
