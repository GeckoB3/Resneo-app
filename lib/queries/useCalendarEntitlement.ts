/**
 * The plan's calendar allowance and the column conflicts the Calendars screen
 * shows (web `BookableCalendarsPanel`):
 *
 *  · GET /api/venue/calendar-entitlement → the "3 / 5 on plan" pill, the
 *    "Add calendar" gate and the tier-specific limit copy.
 *  · GET /api/venue/calendar-column-conflicts → the "Conflict" pill and the
 *    "Resource availability overlap" box on a card.
 *
 * Both routes were cookie-only on the web (`createClient()`); the swap to
 * `createVenueRouteClient(request)` asked for in `Docs/R25_WEB_HANDOVER.md`
 * landed on web staging the same day (`da657660`). A deployment that predates
 * it answers the app's Bearer with 401, which reads as "unknown": no pill, no
 * conflicts, and the screen keeps its after-the-fact 403 handling on create.
 * Keyed under the practitioners scope so creating, deleting or patching a
 * calendar refetches them.
 */
import { useQuery } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { CalendarEntitlement } from '@/lib/venue/calendar-entitlement';

/** Answers that mean "this route is not for the app (yet)", not a failure worth retrying. */
const UNAVAILABLE = new Set([401, 403, 404]);

export function useCalendarEntitlement(enabled = true) {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: [...queryKeys.practitioners.all(), 'entitlement', keyScope(accessToken)] as const,
    enabled: isBackendConfigured() && accessToken !== null && enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<CalendarEntitlement | null> => {
      if (!accessToken) throw new Error('Missing access token');
      try {
        return await apiFetch<CalendarEntitlement>('/api/venue/calendar-entitlement', {
          accessToken,
        });
      } catch (e) {
        if (e instanceof ApiError && UNAVAILABLE.has(e.status)) return null;
        throw e;
      }
    },
  });
}

export interface CalendarColumnConflict {
  calendar_id: string;
  messages: string[];
}

export function useCalendarColumnConflicts(enabled = true) {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: [...queryKeys.practitioners.all(), 'columnConflicts', keyScope(accessToken)] as const,
    enabled: isBackendConfigured() && accessToken !== null && enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<CalendarColumnConflict[]> => {
      if (!accessToken) throw new Error('Missing access token');
      try {
        const res = await apiFetch<{ conflicts?: CalendarColumnConflict[] }>(
          '/api/venue/calendar-column-conflicts',
          { accessToken },
        );
        return Array.isArray(res.conflicts) ? res.conflicts : [];
      } catch (e) {
        if (e instanceof ApiError && UNAVAILABLE.has(e.status)) return [];
        throw e;
      }
    },
  });
}
