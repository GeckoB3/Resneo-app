/**
 * Manage collective, Settings (web Docs/card-on-file-plan.md §21, D27): one read for the whole
 * section, and the host's saves of the collective's booking rules.
 *
 *   read   GET   /api/venue/collectives/[id]/settings   (admins; members read it too)
 *   save   PATCH /api/venue/feature-flags               the optional features
 *          PATCH /api/venue                             sign-in to book
 *
 * Saves go through the same routes as Settings, Booking settings, so both screens share validation
 * and the version check: each names `booking_settings_version` as last read, and a save from an
 * older read is refused with 412 COLLECTIVE_SETTINGS_CHANGED ("{name} changed this a moment ago.
 * Here is the current setting."). The screen then reads the settings again.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiErrorCode, apiFetch, isApiErrorBody } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export interface CollectiveSettingsCalendar {
  id: string;
  name: string;
  venue_id?: string;
  venue_name?: string;
}

export interface CollectiveSettingsPerBusinessItem {
  key: 'payments' | 'hours' | 'messages' | 'forms' | 'treatment_records' | string;
  label: string;
  value: string;
  href: string;
}

/** The payload (web `CollectiveSettingsPayload`, `src/lib/linked-accounts/collective-settings-section.ts`). */
export interface CollectiveSettingsPayload {
  collective: {
    id: string;
    name: string;
    public_name: string;
    host_venue_id: string;
    host_venue_name: string;
    is_host: boolean;
    live: boolean;
  };
  can_edit: boolean;
  top_line: string;
  booking_rules: {
    version: number;
    live: boolean;
    values: Record<string, unknown>;
    resolved: {
      require_account_login: boolean;
      guest_self_reschedule: boolean;
      waitlist_v2: boolean;
      any_available_practitioner: boolean;
      staff_first_booking_flow: boolean;
    };
    waitlist_mode: string;
    any_available_practitioner_config: { mode: 'priority' | 'random'; calendar_order: string[] };
    calendars: CollectiveSettingsCalendar[];
    /** Where a block on a client applies (web 2026-11-19, BC4). Absent on older servers. */
    client_blocks?: { scope: 'collective' | 'business'; business_count: number; block_count: number };
  };
  page: {
    name: string;
    public_name: string;
    public_name_line: string;
    path: string;
    slug: string;
    look: { brand_colour: string | null; logo_url: string | null; cover_photo_url: string | null; lines: string[] };
    edit_href: string | null;
  };
  host_details: {
    title: string;
    body: string;
    address: string | null;
    phone: string | null;
    open_days: number | null;
    lines: string[];
    links: { profile: string; business_hours: string } | null;
  };
  clients: { line: string; sharing_count: number; total_count: number; on: boolean; href: string } | null;
  no_show: {
    title: string;
    line: string;
    members: { venue_id: string; venue_name: string; is_host: boolean }[];
  };
  per_business: { venue_id: string; venue_name: string; body: string; items: CollectiveSettingsPerBusinessItem[] };
}

export const collectiveSettingsKey = (accessToken: string | null, collectiveId: string | null) =>
  [...queryKeys.collectives.all(), 'settings', keyScope(accessToken), collectiveId] as const;

/**
 * GET the section. Null on a server from before the section (a plain 404 with no error body), so
 * the screen can say it is not available rather than show an error.
 */
export function useCollectiveSettings(collectiveId: string | null, enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: collectiveSettingsKey(accessToken, collectiveId),
    enabled: enabled && isBackendConfigured() && accessToken !== null && Boolean(collectiveId),
    queryFn: async (): Promise<CollectiveSettingsPayload | null> => {
      try {
        return await apiFetch<CollectiveSettingsPayload>(
          `/api/venue/collectives/${encodeURIComponent(collectiveId!)}/settings`,
          { accessToken: accessToken! },
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 404 && !isApiErrorBody(error.body)) return null;
        throw error;
      }
    },
  });
}

/** True for the refusal a save from an older read gets (§21.3 item 6). */
export function isStaleCollectiveSave(error: unknown): boolean {
  return error instanceof ApiError && error.status === 412 && apiErrorCode(error) === 'COLLECTIVE_SETTINGS_CHANGED';
}

export type CollectiveRuleSave =
  | { route: 'venue'; patch: { require_account_login_for_bookings: boolean }; version: number }
  | { route: 'feature-flags'; patch: Record<string, unknown>; version: number };

/** The host's choice of where a block on a client applies (web 2026-11-19, BC4). */
export function useSaveClientBlocksScope(collectiveId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { scope: 'collective' | 'business'; version: number }): Promise<unknown> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<unknown>(`/api/venue/collectives/${encodeURIComponent(collectiveId)}/settings`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ client_blocks_scope: input.scope, booking_settings_version: input.version }),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: collectiveSettingsKey(accessToken, collectiveId) });
    },
  });
}

/** A host's save of a collective booking rule, naming the version read. */
export function useSaveCollectiveRule(collectiveId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CollectiveRuleSave): Promise<unknown> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<unknown>(input.route === 'venue' ? '/api/venue' : '/api/venue/feature-flags', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ ...input.patch, booking_settings_version: input.version }),
      });
    },
    // Saved or refused, the current settings are read again: a refusal shows what someone else saved.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: collectiveSettingsKey(accessToken, collectiveId) });
      // Settings, Booking settings and the bootstrap read the same store.
      void queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() });
    },
  });
}
