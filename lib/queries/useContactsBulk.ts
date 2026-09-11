import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import {
  runBulkGuestMessages,
  type BulkGuestMessageOutcome,
  type GuestMessageResponse,
} from '@/lib/communications/bulk-guest-message';
import type { GuestMessageChannel } from '@/lib/communications/guest-message-channel';
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
 * Message every selected contact, as the web's bulk "Message" does
 * (`ContactsDashboard.tsx` `runBulkContactMessage`): one
 * `POST /api/venue/guests/{id}/message` per contact carrying
 * `respect_marketing_permission: true`, so the server leaves out anyone without
 * marketing permission and answers 200 `{ skipped: true, reason }` for them.
 *
 * Resolves with one outcome per selected id, in selection order. It does not
 * reject because a single contact could not be reached — that contact's problem
 * is its own outcome (see `runBulkGuestMessages`).
 */
export function useBulkGuestMessage() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      guest_ids: string[];
      message: string;
      channel: GuestMessageChannel;
    }): Promise<BulkGuestMessageOutcome[]> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return runBulkGuestMessages({
        guestIds: input.guest_ids,
        send: (guestId) =>
          apiFetch<GuestMessageResponse>(`/api/venue/guests/${guestId}/message`, {
            accessToken,
            method: 'POST',
            body: JSON.stringify({
              message: input.message,
              channel: input.channel,
              respect_marketing_permission: true,
            }),
          }),
      });
    },
    onSuccess: (_outcomes, input) => {
      // A message shows on the contact's own detail (its communications log)
      // and timeline; no directory row changes, so leave the paged list alone.
      for (const guestId of input.guest_ids) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.guests.detail(accessToken, guestId).slice(0, -1),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.guests.timeline(accessToken, guestId),
        });
      }
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
