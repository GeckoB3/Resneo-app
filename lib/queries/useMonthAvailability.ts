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
  enabled?: boolean;
}) {
  const accessToken = useAccessToken();
  const isAny = practitionerId === ANY_AVAILABLE_PRACTITIONER_ID;
  // The API requires a concrete practitioner_id even in any-available mode.
  const effectivePractitionerId = isAny
    ? candidatePractitionerIds?.[0] ?? null
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
      practitionerId,
      year,
      month,
      variantId,
      addonsKey,
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
