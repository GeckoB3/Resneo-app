import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { ANY_AVAILABLE_PRACTITIONER_ID } from '@/types/appointment-catalog';

export interface MonthAvailabilityResponse {
  available_dates: string[];
}

/**
 * GET /api/venue/appointment-calendar — which dates in a month have at least
 * one bookable slot. Feeds the wizard's month date-picker.
 */
export function useMonthAvailability({
  serviceId,
  practitionerId,
  candidatePractitionerIds,
  year,
  month,
  variantId,
  addonIds,
  durationMinutes,
  enabled = true,
}: {
  serviceId: string | null | undefined;
  /** Real id, or ANY_AVAILABLE_PRACTITIONER_ID for pooled month availability. */
  practitionerId: string | null | undefined;
  candidatePractitionerIds?: string[];
  year: number;
  /** 1–12. */
  month: number;
  variantId?: string | null;
  addonIds?: string[];
  /** Staff duration override (minutes) — narrows the dates to those that can fit it. */
  durationMinutes?: number | null;
  enabled?: boolean;
}) {
  const accessToken = useAccessToken();
  const isAny =
    practitionerId === ANY_AVAILABLE_PRACTITIONER_ID ||
    (candidatePractitionerIds?.length ?? 0) > 0;
  // Web parity (`appointmentCalendarUrl`): in any-available mode the request
  // carries the SENTINEL practitioner_id plus `any_available=1`, so the server
  // pools across all eligible staff. We must NOT pin to one candidate (e.g.
  // `candidatePractitionerIds[0]`) — that computed green dates from a single
  // practitioner and hid dates other staff could cover.
  const effectivePractitionerId = isAny
    ? ANY_AVAILABLE_PRACTITIONER_ID
    : practitionerId ?? null;
  const addonsKey = addonIds && addonIds.length > 0 ? [...addonIds].sort().join(',') : null;
  const queryEnabled =
    enabled &&
    isBackendConfigured() &&
    accessToken !== null &&
    Boolean(serviceId && effectivePractitionerId);

  return useQuery({
    queryKey: queryKeys.appointments.monthAvailability(
      accessToken,
      serviceId,
      effectivePractitionerId,
      year,
      month,
      variantId,
      addonsKey,
      durationMinutes ?? null,
    ),
    enabled: queryEnabled,
    queryFn: async (): Promise<MonthAvailabilityResponse> => {
      if (!accessToken || !serviceId || !effectivePractitionerId) {
        throw new Error('Missing month availability parameters');
      }
      const search = new URLSearchParams({
        service_id: serviceId,
        practitioner_id: effectivePractitionerId,
        year: String(year),
        month: String(month),
      });
      if (isAny) search.set('any_available', '1');
      if (variantId) search.set('variant_id', variantId);
      if (durationMinutes != null) search.set('duration_minutes', String(durationMinutes));
      for (const id of addonIds ?? []) {
        search.append('addon_ids', id);
      }
      return apiFetch<MonthAvailabilityResponse>(
        `/api/venue/appointment-calendar?${search.toString()}`,
        { accessToken },
      );
    },
  });
}
