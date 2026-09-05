import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { serialiseServiceChainParam, type ServiceChainSegmentParam } from '@/lib/booking/service-chain';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { ANY_AVAILABLE_PRACTITIONER_ID } from '@/types/appointment-catalog';
import type {
  AppointmentAvailabilityResponse,
  AppointmentSlot,
} from '@/types/appointment-availability';

/**
 * Day availability for a multi-service visit: the starts at which the WHOLE
 * chain fits back to back with one person (web 2026-09-02).
 *
 * This is `GET /api/booking/availability?services=[…]` — the public route,
 * which is where web put the chain; the staff route never gained it, and web's
 * own staff modal calls this one too. With `any_available=1` the server pools
 * only the people who offer every service, so unlike the single-service path
 * there is no client-side fan-out to merge. Slots come back labelled with the
 * FIRST service and carrying the visit's span as `duration_minutes`.
 */
export function chainAvailabilityPath(params: {
  venueId: string;
  date: string;
  practitionerId: string;
  chain: readonly ServiceChainSegmentParam[];
}): string {
  const search = new URLSearchParams({ venue_id: params.venueId, date: params.date });
  if (params.practitionerId === ANY_AVAILABLE_PRACTITIONER_ID) {
    search.set('any_available', '1');
  } else {
    search.set('practitioner_id', params.practitionerId);
  }
  search.set('services', serialiseServiceChainParam(params.chain));
  return `/api/booking/availability?${search.toString()}`;
}

export function useChainAvailability({
  venueId,
  date,
  practitionerId,
  chain,
  enabled = true,
}: {
  venueId: string | null | undefined;
  date: string | null | undefined;
  /** A real practitioner id, or ANY_AVAILABLE_PRACTITIONER_ID to pool. */
  practitionerId: string | null | undefined;
  chain: readonly ServiceChainSegmentParam[];
  enabled?: boolean;
}) {
  const accessToken = useAccessToken();
  const chainKey = serialiseServiceChainParam(chain);
  const queryEnabled =
    enabled &&
    isBackendConfigured() &&
    accessToken !== null &&
    Boolean(venueId && date && practitionerId) &&
    chain.length > 0;

  const query = useQuery({
    queryKey: [
      ...queryKeys.appointments.availabilityAll(),
      'chain',
      keyScope(accessToken),
      venueId ?? null,
      date ?? null,
      practitionerId ?? null,
      chainKey,
    ] as const,
    enabled: queryEnabled,
    queryFn: async (): Promise<AppointmentAvailabilityResponse> => {
      if (!accessToken || !venueId || !date || !practitionerId) {
        throw new Error('Missing chain availability parameters');
      }
      return apiFetch<AppointmentAvailabilityResponse>(
        chainAvailabilityPath({ venueId, date, practitionerId, chain }),
        { accessToken },
      );
    },
  });

  const slots: AppointmentSlot[] = (query.data?.practitioners ?? [])
    .flatMap((p) => p.slots)
    .sort(
      (a, b) =>
        a.start_time.localeCompare(b.start_time) ||
        a.practitioner_name.localeCompare(b.practitioner_name),
    );

  return { ...query, slots };
}
