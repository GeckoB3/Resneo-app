import { useQueries, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  AppointmentAvailabilityResponse,
  AppointmentSlot,
} from '@/types/appointment-availability';

type UseAppointmentAvailabilityParams = {
  date: string | null | undefined;
  serviceId: string | null | undefined;
  /** Practitioner / unified calendar id — API param is practitioner_id. */
  practitionerId?: string | null;
  /** Alias for practitionerId when the caller has a calendar id instead. */
  calendarId?: string | null;
  ownerVenueId?: string | null;
  /** Variant — extends/overrides the base duration on the engine input. */
  variantId?: string | null;
  /** Selected add-ons — extend the slot length the engine must fit. */
  addonIds?: string[];
  /** Staff duration override (base minutes; add-ons stack on top server-side). */
  durationMinutes?: number | null;
  /** Modify flows: free the booking's own slot so it stays selectable. */
  excludeBookingId?: string | null;
  enabled?: boolean;
};

function availabilityPath(params: {
  date: string;
  serviceId: string;
  practitionerId: string;
  ownerVenueId?: string | null;
  variantId?: string | null;
  addonIds?: string[];
  durationMinutes?: number | null;
  excludeBookingId?: string | null;
}): string {
  const search = new URLSearchParams({
    date: params.date,
    service_id: params.serviceId,
    practitioner_id: params.practitionerId,
  });
  if (params.ownerVenueId) search.set('owner_venue_id', params.ownerVenueId);
  if (params.variantId) search.set('variant_id', params.variantId);
  if (params.durationMinutes != null) search.set('duration_minutes', String(params.durationMinutes));
  if (params.excludeBookingId) search.set('exclude_booking_id', params.excludeBookingId);
  for (const id of params.addonIds ?? []) {
    search.append('addon_ids', id);
  }
  return `/api/venue/appointment-availability?${search.toString()}`;
}

/**
 * Loads staff day-level appointment slots for the time picker. Pass the chosen
 * variant/add-ons so the engine reserves the extended duration — otherwise a
 * slot can look bookable here and 409 at create.
 */
export function useAppointmentAvailability({
  date,
  serviceId,
  practitionerId,
  calendarId,
  ownerVenueId,
  variantId,
  addonIds,
  durationMinutes,
  excludeBookingId,
  enabled = true,
}: UseAppointmentAvailabilityParams) {
  const accessToken = useAccessToken();
  const resolvedPractitionerId = practitionerId ?? calendarId ?? null;
  const addonsKey = addonIds && addonIds.length > 0 ? [...addonIds].sort().join(',') : null;
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
      variantId,
      addonsKey,
      durationMinutes,
      excludeBookingId,
    ),
    enabled: queryEnabled,
    queryFn: async (): Promise<AppointmentAvailabilityResponse> => {
      if (!accessToken || !date || !serviceId || !resolvedPractitionerId) {
        throw new Error('Missing availability parameters');
      }
      return apiFetch<AppointmentAvailabilityResponse>(
        availabilityPath({
          date,
          serviceId,
          practitionerId: resolvedPractitionerId,
          ownerVenueId,
          variantId,
          addonIds,
          durationMinutes,
          excludeBookingId,
        }),
        { accessToken },
      );
    },
  });
}

/**
 * How a pooled ("Any available") fan-out reports failure.
 *
 * Client-side pooling is silently lossy by construction: each practitioner is a
 * separate request, and one that fails simply contributes no slots. Two rules,
 * and the second is the one R20-5 existed to add:
 *
 *  - **nothing loaded** → a real error. There is no answer to show.
 *  - **some loaded** → NOT an error. The slots we have are real and bookable, so
 *    blanking them is the failure pooling exists to avoid — but the caller must
 *    be told how many calendars are missing, or a short list reads as a complete
 *    one. Web's Stage 7 makes the staff availability route fail closed rather
 *    than answer with times missing; swallowing that here would convert one
 *    silent partial answer into another.
 *
 * Pure so both halves can be pinned without rendering.
 */
export function pooledAvailabilityFailureState(
  total: number,
  failed: number,
): { isError: boolean; unavailableCount: number } {
  const isError = failed > 0 && failed === total;
  return { isError, unavailableCount: isError ? 0 : failed };
}

/**
 * "Any available" pooling — fetches day slots for each candidate practitioner in
 * parallel and merges them, sorted by start time then practitioner name. The
 * backend's day endpoint requires a specific practitioner_id, so pooling is a
 * client-side merge (the create still targets the slot's real practitioner).
 */
export function useAnyPractitionerAvailability({
  date,
  serviceId,
  practitionerIds,
  ownerVenueId,
  variantId,
  addonIds,
  durationMinutes,
  enabled = true,
}: {
  date: string | null | undefined;
  serviceId: string | null | undefined;
  practitionerIds: string[];
  ownerVenueId?: string | null;
  variantId?: string | null;
  addonIds?: string[];
  durationMinutes?: number | null;
  enabled?: boolean;
}) {
  const accessToken = useAccessToken();
  const addonsKey = addonIds && addonIds.length > 0 ? [...addonIds].sort().join(',') : null;
  const baseEnabled =
    enabled && isBackendConfigured() && accessToken !== null && Boolean(date && serviceId);

  const results = useQueries({
    queries: practitionerIds.map((practitionerId) => ({
      queryKey: queryKeys.appointments.availability(
        accessToken,
        date,
        serviceId,
        practitionerId,
        ownerVenueId,
        variantId,
        addonsKey,
        durationMinutes,
      ),
      enabled: baseEnabled,
      queryFn: async (): Promise<AppointmentAvailabilityResponse> => {
        if (!accessToken || !date || !serviceId) {
          throw new Error('Missing availability parameters');
        }
        return apiFetch<AppointmentAvailabilityResponse>(
          availabilityPath({
            date,
            serviceId: serviceId,
            practitionerId,
            ownerVenueId,
            variantId,
            addonIds,
            durationMinutes,
          }),
          { accessToken },
        );
      },
    })),
  });

  const isLoading = results.some((r) => r.isLoading);
  const isFetching = results.some((r) => r.isFetching);
  const errors = results.filter((r) => r.isError);
  const { isError, unavailableCount } = pooledAvailabilityFailureState(
    results.length,
    errors.length,
  );
  const error = errors[0]?.error ?? null;

  const slots: AppointmentSlot[] = results
    .flatMap((r) => r.data?.practitioners.flatMap((p) => p.slots) ?? [])
    .filter((slot) => slot.service_id === serviceId)
    .sort(
      (a, b) =>
        a.start_time.localeCompare(b.start_time) ||
        a.practitioner_name.localeCompare(b.practitioner_name),
    );

  return {
    slots,
    isLoading,
    isFetching,
    isError,
    error,
    /** Practitioners whose availability could not be read; 0 when all loaded. */
    unavailableCount,
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}
