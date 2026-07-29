import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import {
  SETTLEMENT_POLL_DELAYS_MS,
  SETTLEMENT_WATCH_MAX_AGE_MS,
  settlementWatch,
} from '@/lib/payments/settlement-watch';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingDetail } from '@/types/booking-detail';

/**
 * Loads full booking detail. Prefetches the lightweight /summary route for faster
 * first paint — but under its OWN cache key, surfaced only via `placeholderData`.
 * If the summary shared the full-detail key, a status mutation's `seedDetailFromRow`
 * (which merges a bare PATCH row onto whatever is cached) could land on the partial
 * summary base and strand the nested guest/timeline fields until the next refetch.
 * Keeping the summary on a separate key guarantees the full-detail key is only ever
 * populated by the full fetch (or a merge onto a full base).
 */
export function useBookingDetail(bookingId: string | undefined) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const enabled = isBackendConfigured() && accessToken !== null && Boolean(bookingId);

  useEffect(() => {
    if (!enabled || !bookingId || !accessToken) {
      return;
    }

    void queryClient.prefetchQuery({
      queryKey: [...queryKeys.bookings.detail(accessToken, bookingId), 'summary'],
      queryFn: async (): Promise<BookingDetail> =>
        apiFetch<BookingDetail>(`/api/venue/bookings/${bookingId}/summary`, { accessToken }),
    });
  }, [accessToken, bookingId, enabled, queryClient]);

  const query = useQuery({
    queryKey: queryKeys.bookings.detail(accessToken, bookingId ?? null),
    enabled,
    // Summary prefetch lives on its own key — show it for first paint without ever
    // writing it to the full-detail key.
    placeholderData: () =>
      accessToken && bookingId
        ? queryClient.getQueryData<BookingDetail>([
            ...queryKeys.bookings.detail(accessToken, bookingId),
            'summary',
          ])
        : undefined,
    staleTime: 0,
    queryFn: async (): Promise<BookingDetail> => {
      if (!accessToken || !bookingId) {
        throw new Error('Missing access token or booking id');
      }
      return apiFetch<BookingDetail>(`/api/venue/bookings/${bookingId}`, { accessToken });
    },
  });

  /**
   * Settlement watch (see `lib/payments/settlement-watch.ts`). `staleTime: 0`
   * alone is not enough after a card tap: the payment mutation invalidates once,
   * the instant `confirmPaymentIntent` resolves, and that refetch returns the
   * booking as it was BEFORE the Stripe webhook wrote the paid state. Without
   * this the appointment sits there reading "Outstanding" with a live Take
   * payment button, which is how a client gets charged twice.
   *
   * The whole `bookings` branch is invalidated rather than just this detail: the
   * list and range queries behind the sheet show the same stale money state.
   */
  const watch = settlementWatch(query.data?.payments);
  const watchKey = watch?.key ?? null;
  const watchStartedAtMs = watch?.startedAtMs ?? 0;
  useEffect(() => {
    if (!enabled || !watchKey) return;
    // Age is judged here rather than in render, where reading the clock would be
    // impure. A row older than the window is stuck, not in flight: its webhook
    // is never coming, so re-polling on every open would be noise.
    if (Date.now() - watchStartedAtMs > SETTLEMENT_WATCH_MAX_AGE_MS) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let step = 0;

    const schedule = () => {
      const delay = SETTLEMENT_POLL_DELAYS_MS[step];
      // Out of steps: give up rather than poll for the rest of the shift. The
      // pending row stays on screen, which is what staff need to act on it.
      if (delay == null) return;
      step += 1;
      timer = setTimeout(() => {
        if (cancelled) return;
        void queryClient
          .invalidateQueries({ queryKey: queryKeys.bookings.all() })
          .finally(() => {
            // A settled row clears `watchKey`, and the effect cleanup below
            // cancels this chain before the next timer can fire.
            if (!cancelled) schedule();
          });
      }, delay);
    };
    schedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, watchKey, watchStartedAtMs, queryClient]);

  return query;
}
