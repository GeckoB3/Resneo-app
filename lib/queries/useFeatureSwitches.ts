import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { posFinishingOpen } from '@/lib/pos/pos-enabled';
import { fetchFeatureSwitches, postDismissPrompt, postFeatureSwitch, readSwitchRefusal, switchPaths } from '@/lib/pos/switches/api';
import { venueWithSwitches, wayBack, type WayBack } from '@/lib/pos/switches/model';
import { rememberOfferHidden } from '@/lib/pos/switches/offer-dismissal';
import { downloadReportFile } from '@/lib/reports/pos-report-download';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useOrdersBadge } from '@/lib/queries/useOrders';
import { usePosSaleList } from '@/lib/queries/usePos';
import { useTillSessions } from '@/lib/queries/useTill';
import type { PosFeatureSwitchesResponse, PosFeatureSwitchRequest, PosFeatureSwitchResult } from '@/types/pos-switches';
import type { VenueBootstrap } from '@/types/venue';

/**
 * Switching Checkout and its extras on and off in the app (POS Part 5), over Bearer, as the web
 * does: `GET` and `POST /api/venue/feature-switches` (admins only), the vouchers list for the off
 * sheet, and "Hide this" on the Today card. Nothing here is asked of a team member: the screens
 * that call it are for admins.
 */

/** `GET /api/venue/feature-switches`: every switch, the counts for the off sheet and the history. */
export function useFeatureSwitches(options: { enabled?: boolean } = {}) {
  const accessToken = useAccessToken();
  const enabled = (options.enabled ?? true) && isBackendConfigured() && accessToken !== null;
  return useQuery({
    queryKey: queryKeys.posSwitches.state(accessToken),
    enabled,
    staleTime: 5_000,
    // A team member (403) or a server before the route (404) is an answer, not a hiccup.
    retry: (count, error) => !(error instanceof ApiError && [401, 403, 404].includes(error.status)) && count < 2,
    queryFn: () => fetchFeatureSwitches(accessToken!),
  });
}

/**
 * After a change: the switches as the server answered, the venue with them (so the Checkout tiles,
 * Today's cards and the hub move at once), then a fresh read of the venue and of every Checkout
 * query, the POS bootstrap included.
 */
export function applySwitchResult(queryClient: QueryClient, accessToken: string | null, res: PosFeatureSwitchesResponse): void {
  queryClient.setQueryData(queryKeys.posSwitches.state(accessToken), res);
  queryClient.setQueryData<VenueBootstrap>(queryKeys.venue.bootstrap(accessToken), (old) => (old ? venueWithSwitches(old, res) : old));
  void queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.pos.all() });
}

/**
 * `POST /api/venue/feature-switches`. A good answer is applied everywhere (`applySwitchResult`),
 * unless `deferApply`: switching on makes several calls in a row and applies the last answer
 * itself, so the screen behind its sheet does not change halfway. A stale answer (412) carries the
 * fresh state, which replaces the cached one before the error reaches the sheet.
 */
export function useSetFeatureSwitch(options: { deferApply?: boolean } = {}) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const deferApply = options.deferApply === true;
  return useMutation({
    mutationFn: async (body: PosFeatureSwitchRequest): Promise<PosFeatureSwitchResult> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return postFeatureSwitch(accessToken, body);
    },
    onSuccess: (result) => {
      if (!deferApply && result?.switches) applySwitchResult(queryClient, accessToken, result.switches);
    },
    onError: (error) => {
      const refusal = readSwitchRefusal(error);
      if (refusal.kind === 'stale' && refusal.switches) {
        queryClient.setQueryData(queryKeys.posSwitches.state(accessToken), refusal.switches);
      } else if (refusal.kind === 'not_available' || refusal.kind === 'needs_ack' || refusal.kind === 'in_use') {
        // The venue moved on (a pause, a lapse, a new payment): read both again.
        void queryClient.invalidateQueries({ queryKey: queryKeys.posSwitches.all() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() });
      }
    },
  });
}

/**
 * "Hide this" on the Today offer card: `POST /api/venue/prompts/dismiss` with `pos_offer`, kept on
 * the staff row, so the web's card and "New" item hide too. The card hides at once on this phone,
 * and the venue is read again, whose `dismissed_prompts` and shut `pos_door` then keep it hidden.
 */
export function useHidePosOffer(scope: string | null) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      await postDismissPrompt(accessToken, 'pos_offer');
    },
    onSuccess: () => {
      if (scope) rememberOfferHidden(scope);
      void queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() });
    },
  });
}

/**
 * The way back while Checkout is off (design section 7.2, the web's `loadPosWayBack`): whether More
 * keeps Orders and Sales history. Asked only at a venue that has had Checkout: the orders badge
 * (its route answers only logins with `manage_orders`) and, for admins, the open and part-paid
 * sales and the tills. Each route stays open with Checkout off.
 */
export function usePosWayBack(venue: Pick<VenueBootstrap, 'feature_flags'> | null | undefined, isAdmin: boolean): WayBack {
  const finishing = posFinishingOpen(venue);
  const badge = useOrdersBadge({ enabled: finishing, finishing: true });
  const open = usePosSaleList({ status: 'open' }, { enabled: finishing && isAdmin, finishing: true });
  const tills = useTillSessions({ enabled: finishing && isAdmin, finishing: true });
  return wayBack({
    finishing,
    isAdmin,
    orders: badge.data ?? null,
    openSales: open.data?.sales?.length ?? 0,
    tillOpen: (tills.data?.tills ?? []).some((till) => Boolean(till.session)),
  });
}

/**
 * "Download the list" in the off sheet: the gift vouchers and credit with money left, as a CSV the
 * server builds (last four characters, holder, balance, expiry), through the share sheet.
 */
export async function downloadVouchersList(accessToken: string, dialogTitle: string): Promise<{ ok: true } | { ok: false; message: string | null }> {
  const res = await downloadReportFile({
    path: switchPaths.vouchersCsv,
    accessToken,
    fallbackFilename: 'gift-vouchers-and-credit.csv',
    mimeType: 'text/csv',
    dialogTitle,
  });
  return res.ok ? { ok: true } : { ok: false, message: res.message };
}
