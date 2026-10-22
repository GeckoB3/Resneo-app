import NetInfo from '@react-native-community/netinfo';
import {
  QueryClient,
  focusManager,
  hashKey,
  onlineManager,
  type DefaultError,
  type DefaultedQueryObserverOptions,
  type Query,
  type QueryKey,
  type QueryObserver,
  type QueryObserverOptions,
} from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { ApiError, isSiteSwitchedError } from '@/lib/api/client';
import { getChosenSiteId, getSiteEpoch } from '@/lib/sites/active-site';

/**
 * Make React Query aware of REAL device connectivity via NetInfo (W1.7).
 *
 * Without this, RN has no `navigator.onLine`, so React Query assumes it's always
 * online: a mutation fired during signal loss is sent, stalls, and (with the
 * request timeout from W1.1) fails — the tap is effectively lost. With NetInfo
 * wired, React Query PAUSES mutations while offline and resumes them once
 * connectivity returns — an in-session write queue that pairs with the
 * OfflineBanner. We deliberately do NOT persist the mutation cache across app
 * restarts (that could double-submit a paused booking after a kill); resilience
 * is within-session only.
 */
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isConnected));
  }),
);

/**
 * Make React Query aware of foreground/background via AppState (W1.8).
 *
 * RN has no `window` focus events, so without this the app is treated as ALWAYS
 * focused: `refetchInterval` polls keep firing while backgrounded (battery/data
 * drain, and they race the Supabase background-token issue) and
 * `refetchOnWindowFocus` never fires on resume (stale data when the user returns).
 *
 * We treat only a true `background` as "blurred", NOT the transient `inactive`
 * (the biometric prompt, Control Centre / notification pull-down, app-switcher
 * peek) — so polling pauses only when genuinely backgrounded and stale queries
 * refetch exactly once on return, without churning on every inactive flicker.
 * Web keeps React Query's built-in visibility default.
 */
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) => {
      handleFocus(state !== 'background');
    });
    return () => subscription.remove();
  });
}

/**
 * Shared TanStack Query client.
 * Default staleTime reduces refetches when switching tabs during a busy shift.
 *
 * IMPORTANT: we deliberately do NOT sign the user out on a 401.
 *
 * A 401 from a `/api/venue/*` route means the venue backend rejected the
 * request — e.g. the route isn't Bearer-ready yet (the Phase 0.5 prerequisite),
 * the token wasn't recognised, or the user isn't staff. None of those mean the
 * Supabase auth *session* is invalid. A previous global "401 → signOut" handler
 * caused a login loop: right after sign-in the staff gate's
 * `GET /api/venue/staff/me` 401'd and instantly cleared a perfectly valid
 * session, bouncing the user back to the login screen.
 *
 * Who handles auth instead:
 * - Genuine session expiry → Supabase auto-refresh + `onAuthStateChange`
 *   (see AuthProvider) emit SIGNED_OUT and clear the session.
 * - "Valid session but not venue staff" → the `(app)` staff gate maps a
 *   staff/me 401 to a redirect to `/staff-required`.
 * - Per-screen 401/403 messaging → `getApiErrorMessage` in lib/api/client.
 */
/**
 * The site segment of every query hash (web roles plan §6.2c): the chosen site's id, or `home` with
 * none chosen. One login can act on several businesses and every key is the same at each of them
 * (`['reserveNI', 'venue', 'bootstrap', userId]`), so the hash carries the site rather than 134 key
 * builders each taking it. Partial-key matching (`invalidateQueries({ queryKey })`) reads the key,
 * not the hash, so it is unaffected.
 */
export function siteQueryKeyHash(queryKey: QueryKey): string {
  return hashKey([getChosenSiteId() ?? 'home', ...queryKey]);
}

/** Any query, whatever its data. */
type AnyQuery = Query<any, any, any, any>;

/** Does this query belong to the site the phone acts on now? */
function isCurrentSiteQuery(query: AnyQuery): boolean {
  return query.queryHash === siteQueryKeyHash(query.queryKey);
}

type PlaceholderFn = (previousData: unknown, previousQuery: AnyQuery | undefined) => unknown;

/** Per placeholder function, its site-checked wrapper, made again at each switch. */
const siteCheckedPlaceholders = new WeakMap<PlaceholderFn, { epoch: number; wrapped: PlaceholderFn }>();
/** Each wrapper's own function, so options defaulted twice are never wrapped twice. */
const wrappedOriginals = new WeakMap<PlaceholderFn, PlaceholderFn>();

/**
 * `placeholderData` that never carries one site's answer into another's screen.
 *
 * About thirty queries keep the previous answer on screen while a new key loads
 * (`keepPreviousData`): the calendar while the day changes, the client list while
 * the search does. Across a site switch that would paint the old business's
 * bookings and clients on the new one's calendar until the fetch landed. The
 * wrapper hands the previous answer on only when it came from the current site.
 * It is made afresh at each switch so React Query, which reuses a placeholder
 * while the function is the same one, asks again.
 */
export function siteCheckedPlaceholder(placeholder: PlaceholderFn): PlaceholderFn {
  const fn = wrappedOriginals.get(placeholder) ?? placeholder;
  const epoch = getSiteEpoch();
  const known = siteCheckedPlaceholders.get(fn);
  if (known && known.epoch === epoch) return known.wrapped;
  const wrapped: PlaceholderFn = (previousData, previousQuery) =>
    previousQuery && !isCurrentSiteQuery(previousQuery) ? undefined : fn(previousData, previousQuery);
  siteCheckedPlaceholders.set(fn, { epoch, wrapped });
  wrappedOriginals.set(wrapped, fn);
  return wrapped;
}

/**
 * The app's QueryClient: React Query's own, with every query's `placeholderData` checked against
 * the site (`siteCheckedPlaceholder`). `defaultQueryOptions` is where every `useQuery`, `useQueries`
 * and observer turns its options into the ones it runs with, so this one place covers them all.
 */
export class SiteScopedQueryClient extends QueryClient {
  override defaultQueryOptions<
    TQueryFnData = unknown,
    TError = DefaultError,
    TData = TQueryFnData,
    TQueryData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = never,
  >(
    options:
      | QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey, TPageParam>
      | DefaultedQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
  ): DefaultedQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey> {
    const defaulted = super.defaultQueryOptions(options);
    const placeholder: unknown = defaulted.placeholderData;
    if (typeof placeholder !== 'function') return defaulted;
    const checked = siteCheckedPlaceholder(placeholder as PlaceholderFn);
    // Already checked for this site (options defaulted once before): the same object, as React Query expects.
    if (checked === placeholder) return defaulted;
    return { ...defaulted, placeholderData: checked as typeof defaulted.placeholderData };
  }
}

export const queryClient = new SiteScopedQueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      queryKeyHashFn: siteQueryKeyHash,
      // Retry transient failures once, but never auth/permission failures: a
      // 401/403 won't fix itself on a second try and just delays the staff
      // gate (staff/me) or the on-screen error. Nor an answer dropped by a site
      // switch: it was about the site the person has left.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return false;
        }
        if (isSiteSwitchedError(error)) return false;
        return failureCount < 1;
      },
    },
  },
});

/**
 * Let go of every answer about the old site (web roles plan §6.2c).
 *
 * `clear()` empties the query cache, and with it the mutation cache: the writes
 * React Query holds while the phone is offline go too, rather than being sent
 * later under the new site's header. Screens still on the stack keep their
 * observers, which point at the queries just removed; each is moved onto the
 * new site's query (its options defaulted again, so the hash is worked out with
 * the new site), which re-renders its screen and fetches. Without that a tab
 * left open would go on showing the old business until something re-rendered it.
 */
export function resetQueriesForSiteChange(client: QueryClient = queryClient): void {
  const observers = new Set<QueryObserver<any, any, any, any, any>>();
  for (const query of client.getQueryCache().getAll()) {
    for (const observer of query.observers) observers.add(observer);
  }
  client.clear();
  for (const observer of observers) {
    const { queryHash: _hash, _defaulted: _flag, ...options } = observer.options;
    try {
      observer.setOptions(options);
    } catch {
      // Left as it was: its screen fetches again when it next renders.
    }
  }
}

