import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { getSupabase } from '@/lib/supabase';

export type LiveSyncState = 'live' | 'reconnecting' | 'idle';

export interface VenuePostgresSubscription {
  table: string;
  /** Supabase realtime filter, e.g. `venue_id=eq.${venueId}`. */
  filter?: string;
}

const DEFAULT_POLL_MS = 30_000;

interface UseVenueLiveSyncOptions {
  venueId?: string | null;
  /** Called for change events and during polling fallback. */
  onRefresh: () => void;
  subscriptions: VenuePostgresSubscription[];
  pollMs?: number;
  /** When false, no subscription is created and no polling runs. */
  enabled?: boolean;
}

function scheduleLiveSyncState(
  setState: Dispatch<SetStateAction<LiveSyncState>>,
  next: LiveSyncState,
) {
  queueMicrotask(() => {
    setState((current) => (current === next ? current : next));
  });
}

/**
 * Subscribe to Supabase postgres changes scoped to a venue, with a polling fallback
 * while the realtime channel is not yet SUBSCRIBED.
 *
 * Mirrors web's `useVenuePostgresLiveSync` but uses our singleton Supabase client.
 */
export function useVenueLiveSync({
  venueId,
  onRefresh,
  subscriptions,
  pollMs = DEFAULT_POLL_MS,
  enabled = true,
}: UseVenueLiveSyncOptions): LiveSyncState {
  const [state, setState] = useState<LiveSyncState>('idle');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSubscribedRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  const subscriptionsRef = useRef(subscriptions);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
    subscriptionsRef.current = subscriptions;
  });

  const subscriptionKey = subscriptions
    .map((sub) => `${sub.table}:${sub.filter ?? ''}`)
    .join('|');
  const signature = `${enabled ? '1' : '0'}|${venueId ?? ''}|${pollMs}|${subscriptionKey}`;

  useEffect(() => {
    if (!enabled || !venueId || subscriptionsRef.current.length === 0) {
      scheduleLiveSyncState(setState, 'idle');
      return undefined;
    }

    let supabase;
    try {
      supabase = getSupabase();
    } catch (error) {
      console.warn('[useVenueLiveSync] Supabase not configured:', error);
      scheduleLiveSyncState(setState, 'idle');
      return undefined;
    }

    scheduleLiveSyncState(setState, 'reconnecting');

    const channelName = `venue-live-${venueId}-${subscriptionsRef.current
      .map((s) => s.table)
      .join('-')}`;
    let channel = supabase.channel(channelName);

    for (let index = 0; index < subscriptionsRef.current.length; index += 1) {
      const sub = subscriptionsRef.current[index]!;
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: sub.table,
          ...(sub.filter ? { filter: sub.filter } : {}),
        },
        () => {
          onRefreshRef.current();
        },
      );
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        const hadConnectionBefore = hasSubscribedRef.current;
        hasSubscribedRef.current = true;
        scheduleLiveSyncState(setState, 'live');
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        if (hadConnectionBefore) {
          onRefreshRef.current();
        }
        return;
      }

      scheduleLiveSyncState(setState, 'reconnecting');
      if (!pollRef.current) {
        pollRef.current = setInterval(() => {
          onRefreshRef.current();
        }, pollMs);
      }
    });

    return () => {
      hasSubscribedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return state;
}
