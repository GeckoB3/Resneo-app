import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { posErrorMessage } from '@/lib/pos/api';
import {
  fetchCollectPhones,
  fetchReceiptPreview,
  fetchSetupStatus,
  isSetupRefusal,
  isSetupStale,
  sendSetupProgress,
  staleSetupStatus,
} from '@/lib/pos/setup/api';
import { setupT } from '@/lib/pos/setup/copy';
import type { PosCollectPhonesResponse } from '@/lib/pos/setup/phone';
import { postDismissPrompt } from '@/lib/pos/switches/api';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePosGate } from '@/lib/queries/usePos';
import type { PosSetupProgressPatch, PosSetupStatus } from '@/types/pos-setup';

/**
 * Setting up Checkout in the app (POS Part 4) over Bearer: the set-up status and progress (the card
 * and the wizard), "Hide" on the card, the phones that can take cards, and the receipt preview.
 * (W11 starts its practice sale through the practice sale's own `useOpenPracticeSale`.) Every read
 * is behind the POS gate (`usePosGate`), so a venue without Checkout never calls a set-up route; the
 * screens that call them are for admins.
 */

/** Under `pos`, so anything that reads Checkout again reads the set-up status again too. */
export const setupKeys = {
  status: (accessToken?: string | null) => [...queryKeys.pos.all(), 'setup-status', keyScope(accessToken)] as const,
  phones: (accessToken?: string | null) => [...queryKeys.pos.all(), 'collect-phones', keyScope(accessToken)] as const,
  preview: (accessToken?: string | null) => [...queryKeys.pos.all(), 'receipt-preview', keyScope(accessToken)] as const,
};

/**
 * `GET /api/venue/pos/setup-status`: each step's state from real data, the saved answers, where
 * "Continue" goes, the team's phones and whether the card shows. A team member (403) or a server
 * before Part 4 (404) is an answer: nothing shows.
 */
export function usePosSetupStatus(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: setupKeys.status(accessToken),
    enabled,
    staleTime: 10_000,
    retry: (count, error) => !isSetupRefusal(error) && count < 2,
    queryFn: () => fetchSetupStatus(accessToken!),
  });
}

export type SetupProgressResult = { ok: true; status: PosSetupStatus } | { ok: false; message: string };

/**
 * `PATCH /api/venue/pos/setup-progress` at the version last read. Answers merge on the server, so
 * a stale answer (412, someone else saved first) is sent once more at the fresh version it
 * carried. Answers, never throws; the fresh status replaces the cached one.
 */
export function useSaveSetupProgress() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useCallback(
    async (patch: Omit<PosSetupProgressPatch, 'version'>): Promise<SetupProgressResult> => {
      const fallback = setupT('setup.error.save');
      if (!accessToken) return { ok: false, message: fallback };
      const key = setupKeys.status(accessToken);
      let current = queryClient.getQueryData<PosSetupStatus>(key) ?? null;
      if (!current) {
        try {
          current = await fetchSetupStatus(accessToken);
        } catch (error) {
          return { ok: false, message: posErrorMessage(error, fallback) };
        }
      }
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const next = await sendSetupProgress(accessToken, { ...patch, version: current.version });
          queryClient.setQueryData(key, next);
          return { ok: true, status: next };
        } catch (error) {
          if (attempt === 0 && isSetupStale(error)) {
            const fresh = staleSetupStatus(error) ?? (await fetchSetupStatus(accessToken).catch(() => null));
            if (fresh) {
              queryClient.setQueryData(key, fresh);
              current = fresh;
              continue;
            }
          }
          return { ok: false, message: posErrorMessage(error, fallback) };
        }
      }
      return { ok: false, message: fallback };
    },
    [accessToken, queryClient],
  );
}

/**
 * Reads the POS bootstrap again: after card payments in person come on, its `card_methods` change,
 * and this phone tells the server it can take cards (`CardCapabilityReporter`) only once it has.
 */
export function useRefreshPosBootstrap() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: queryKeys.pos.bootstrap(accessToken) }), [accessToken, queryClient]);
}

/** Reads the set-up status again (after a write that a step's tick follows, a product added). */
export function useRefreshSetupStatus() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: setupKeys.status(accessToken) }), [accessToken, queryClient]);
}

/**
 * "Hide" on the set-up card: `POST /api/venue/prompts/dismiss` with `pos_setup`, kept on the staff
 * row for this admin on every device (the web's card hides too). The card goes at once, and the
 * venue is read again for its `dismissed_prompts`.
 */
export function useHideSetupCard() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!accessToken) throw new Error(setupT('setup.card.hideFailed'));
      await postDismissPrompt(accessToken, 'pos_setup');
    },
    onSuccess: () => {
      queryClient.setQueryData<PosSetupStatus>(setupKeys.status(accessToken), (old) =>
        old ? { ...old, card_hidden: true, show_card: false } : old,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() });
    },
  });
}

/**
 * `GET /api/venue/pos/collect-phones`, read every five seconds while `poll` (a screen waiting for a
 * phone to register is open and on top) until `until` says what it waited for has come, and not
 * at all otherwise.
 */
export function useCollectPhones(
  options: { enabled?: boolean; poll?: boolean; until?: (data: PosCollectPhonesResponse | undefined) => boolean } = {},
) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const { poll = false, until } = options;
  return useQuery({
    queryKey: setupKeys.phones(accessToken),
    enabled,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => (poll && !(until?.(query.state.data) ?? false) ? 5_000 : false),
    queryFn: () => fetchCollectPhones(accessToken!),
  });
}

/** W5's "Preview a receipt" (`GET /api/venue/pos/receipt-preview`): read fresh each time it opens. */
export function useReceiptPreview(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: setupKeys.preview(accessToken),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: () => fetchReceiptPreview(accessToken!),
  });
}
