import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

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

/** POST /api/venue/contacts/bulk {action:'marketing_message'} — bulk email/SMS (admin). */
export function useBulkMarketingMessage() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (input: {
      guest_ids: string[];
      subject: string;
      body: string;
      channel: 'email' | 'sms' | 'both';
    }): Promise<{ sent?: number; skipped?: number }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ sent?: number; skipped?: number }>('/api/venue/contacts/bulk', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ action: 'marketing_message', ...input }),
      });
    },
  });
}

/** POST /api/venue/guests/merge — fold source contacts into a target (admin). */
export function useMergeGuests() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      target_guest_id: string;
      source_guest_ids: string[];
    }): Promise<unknown> => {
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
