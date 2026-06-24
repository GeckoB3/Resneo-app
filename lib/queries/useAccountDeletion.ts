import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { useAccessToken } from '@/lib/queries/useAccessToken';

// ---------------------------------------------------------------------------
// Types — mirror the web `/api/account/delete-request` route.
// ---------------------------------------------------------------------------

/** POST /api/account/delete-request response. */
export interface AccountDeletionRequestResponse {
  /** ISO timestamp the account is scheduled to be permanently deleted, or null. */
  deletion_scheduled_at: string | null;
}

// ---------------------------------------------------------------------------
// POST /api/account/delete-request — schedule permanent deletion of the
// *signed-in user's own account* (Apple Guideline 5.1.1(v)).
// ---------------------------------------------------------------------------

/**
 * Requests permanent deletion of the current user's account. This is distinct
 * from venue deletion (see `useVenueDeletion`): it removes the login/identity
 * the user created at sign-up, not a business record.
 *
 * The web route (Bearer-capable) sets a 30-day grace marker on `user_profiles`,
 * immediately anonymises the user's linked guest PII, emails a confirmation with
 * a cancel link, and then GLOBALLY signs the user out — after the grace period
 * the `account-hard-delete` cron permanently deletes the Supabase auth user.
 *
 * Because the server revokes the session globally, the caller MUST sign out
 * locally on success (the in-memory refresh token is already dead). There is no
 * request body: the server derives the user from the Bearer token.
 */
export function useRequestAccountDeletion() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (): Promise<AccountDeletionRequestResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<AccountDeletionRequestResponse>('/api/account/delete-request', {
        accessToken,
        method: 'POST',
      });
    },
  });
}
