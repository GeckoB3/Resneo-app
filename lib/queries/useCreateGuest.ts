import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export interface CreateGuestInput {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

export interface CreatedGuestResponse {
  guest: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  };
  /** true when a new record was created; false when an existing record matched by email/phone. */
  created: boolean;
}

/**
 * POST /api/venue/guests — create a new contact (or return existing deduped by email/phone).
 * On success invalidates the guest list so the directory refreshes.
 */
export function useCreateGuest() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateGuestInput): Promise<CreatedGuestResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<CreatedGuestResponse>('/api/venue/guests', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all() });
    },
  });
}
