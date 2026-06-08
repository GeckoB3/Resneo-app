import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { AppointmentAvailabilityResponse } from '@/types/appointment-availability';

type UseAppointmentAvailabilityParams = {
  date: string | null | undefined;
  serviceId: string | null | undefined;
  /** Practitioner / unified calendar id — API param is practitioner_id. */
  practitionerId?: string | null;
  /** Alias for practitionerId when the caller has a calendar id instead. */
  calendarId?: string | null;
  ownerVenueId?: string | null;
  enabled?: boolean;
};

/**
 * Loads staff day-level appointment slots for the walk-in time picker.
 */
export function useAppointmentAvailability({
  date,
  serviceId,
  practitionerId,
  calendarId,
  ownerVenueId,
  enabled = true,
}: UseAppointmentAvailabilityParams) {
  const accessToken = useAccessToken();
  const resolvedPractitionerId = practitionerId ?? calendarId ?? null;
  const queryEnabled =
    enabled &&
    isBackendConfigured() &&
    accessToken !== null &&
    Boolean(date && serviceId && resolvedPractitionerId);

  return useQuery({
    queryKey: queryKeys.appointments.availability(
      accessToken,
      date,
      serviceId,
      resolvedPractitionerId,
      ownerVenueId,
    ),
    enabled: queryEnabled,
    queryFn: async (): Promise<AppointmentAvailabilityResponse> => {
      if (!accessToken || !date || !serviceId || !resolvedPractitionerId) {
        throw new Error('Missing availability parameters');
      }

      const params = new URLSearchParams({
        date,
        service_id: serviceId,
        practitioner_id: resolvedPractitionerId,
      });
      if (ownerVenueId) {
        params.set('owner_venue_id', ownerVenueId);
      }

      return apiFetch<AppointmentAvailabilityResponse>(
        `/api/venue/appointment-availability?${params.toString()}`,
        { accessToken },
      );
    },
  });
}
