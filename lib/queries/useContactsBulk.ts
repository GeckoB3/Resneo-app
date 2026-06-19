import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { MergeGuestsInput } from '@/types/guest-merge';

function invalidateContacts(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all() });
}

/** POST /api/venue/contacts/bulk {action:'add_tag'} — tag many contacts (admin). */
export function useBulkAddTag() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { guest_ids: string[]; tag: string }): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/contacts/bulk', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ action: 'add_tag', ...input }),
      });
    },
    onSuccess: () => invalidateContacts(queryClient),
  });
}

/** POST /api/venue/contacts/bulk {action:'remove_tag'} — remove tag from many contacts (admin). */
export function useBulkRemoveTag() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { guest_ids: string[]; tag: string }): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/contacts/bulk', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ action: 'remove_tag', ...input }),
      });
    },
    onSuccess: () => invalidateContacts(queryClient),
  });
}

/**
 * Per-contact outcome from the bulk marketing-message action. The route returns
 * one entry per FOUND contact (`sent` true, or a `skipped_reason`/`error`), plus
 * `missing_ids` for any selected id that wasn't found — there is NO top-level
 * `sent`/`skipped` count, so callers must derive the totals from `results`.
 */
export type BulkMarketingMessageResult = {
  results: { guest_id: string; sent?: boolean; skipped_reason?: string; error?: string }[];
  missing_ids: string[];
};

/** POST /api/venue/contacts/bulk {action:'marketing_message'} — bulk email/SMS (admin). */
export function useBulkMarketingMessage() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (input: {
      guest_ids: string[];
      subject: string;
      body: string;
      channel: 'email' | 'sms' | 'both';
    }): Promise<BulkMarketingMessageResult> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<BulkMarketingMessageResult>('/api/venue/contacts/bulk', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ action: 'marketing_message', ...input }),
      });
    },
  });
}

/** POST /api/venue/guests/merge — fold source contacts into a target with field-level resolution (admin). */
export function useMergeGuests() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MergeGuestsInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/guests/merge', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateContacts(queryClient),
  });
}

/** GET /api/venue/gdpr/export-guest — export all data for a contact as JSON (admin only). */
export async function fetchGuestGdprExport(
  accessToken: string,
  guestId: string,
): Promise<unknown> {
  return apiFetch<unknown>(
    `/api/venue/gdpr/export-guest?guest_id=${encodeURIComponent(guestId)}`,
    { accessToken },
  );
}
