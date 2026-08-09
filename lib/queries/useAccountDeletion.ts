import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { getSupabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types — mirror the web `/api/account/delete-request` routes.
// ---------------------------------------------------------------------------

/** POST /api/account/delete-request response. */
export interface AccountDeletionRequestResponse {
  /** ISO timestamp the account is scheduled to be permanently deleted, or null. */
  deletion_scheduled_at: string | null;
}

const deletionStatusKey = (accessToken: string | null) =>
  [...queryKeys.all, 'accountDeletionStatus', keyScope(accessToken)] as const;

// ---------------------------------------------------------------------------
// POST /api/account/delete-request — schedule permanent deletion of the
// *signed-in user's own account* (Apple Guideline 5.1.1(v)).
// ---------------------------------------------------------------------------

/**
 * Requests permanent deletion of the current user's account. This is distinct
 * from venue deletion (see `useVenueDeletion`): it removes the login/identity
 * the user created at sign-up, not a business record.
 *
 * The web route (Bearer-capable) sets a 30-day grace marker on `user_profiles`
 * (`deleted_at` = the scheduled deletion time), emails a confirmation with a
 * cancel link, and then GLOBALLY signs the user out. Nothing is anonymised at
 * request time — since web migration `20270103121000` the request marks intent
 * only, and the `account-hard-delete` cron is the sole writer that destroys
 * identity once the grace period elapses. That deferral is what makes the
 * request genuinely cancellable (see {@link useCancelAccountDeletion}).
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

// ---------------------------------------------------------------------------
// Pending-deletion status — is the signed-in account inside its grace window?
// ---------------------------------------------------------------------------

/**
 * The signed-in user's scheduled-deletion state, for the Account screen's
 * pending banner (a user who signs back in during the 30-day grace window
 * should see the deletion and be able to cancel it — web parity with the
 * `/account/security` page, R11-2).
 *
 * There is no status route on the web; its page just offers both buttons
 * blindly. We can do better for free: `user_profiles.deleted_at` is the
 * grace marker and is readable by its owner under RLS
 * (`user_profiles_select_own`, `id = auth.uid()`), so this reads it directly
 * through the Supabase client rather than adding a backend route.
 */
export function useAccountDeletionStatus() {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: deletionStatusKey(accessToken),
    enabled: isBackendConfigured() && accessToken !== null,
    queryFn: async (): Promise<AccountDeletionRequestResponse> => {
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('user_profiles')
        .select('deleted_at')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return {
        deletion_scheduled_at: (data?.deleted_at as string | null | undefined) ?? null,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/account/delete-request/cancel — abort a scheduled deletion.
// ---------------------------------------------------------------------------

/**
 * Cancels a pending account deletion during the grace window (the server RPC
 * `cancel_account_deletion` clears `user_profiles.deleted_at`; nothing was
 * anonymised at request time, so cancelling restores full normality). Route is
 * Bearer-capable like the request. Invalidates the status query so the
 * Account screen's pending banner clears itself.
 */
export function useCancelAccountDeletion() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ ok: boolean }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ ok: boolean }>('/api/account/delete-request/cancel', {
        accessToken,
        method: 'POST',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: deletionStatusKey(accessToken) });
    },
  });
}
