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
  /**
   * The staff form's hint that a member venue's session is on the request (web
   * 2026-09-05). Verified server-side, it widens a collective's catalogue to
   * the members' own services; a venue's own id ignores it.
   */
  staff?: boolean;
}): string {
  const search = new URLSearchParams({ venue_id: params.venueId, date: params.date });
  if (params.staff) search.set('staff', '1');
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
  staff = false,
}: {
  venueId: string | null | undefined;
  date: string | null | undefined;
  /** A real practitioner id, or ANY_AVAILABLE_PRACTITIONER_ID to pool. */
  practitionerId: string | null | undefined;
  chain: readonly ServiceChainSegmentParam[];
  enabled?: boolean;
  /** Booking for a venue collective: send the staff hint (see `chainAvailabilityPath`). */
  staff?: boolean;
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
      staff ? 'staff' : 'public',
    ] as const,
    enabled: queryEnabled,
    queryFn: async (): Promise<AppointmentAvailabilityResponse> => {
      if (!accessToken || !venueId || !date || !practitionerId) {
        throw new Error('Missing chain availability parameters');
      }
      return apiFetch<AppointmentAvailabilityResponse>(
        chainAvailabilityPath({ venueId, date, practitionerId, chain, staff }),
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
