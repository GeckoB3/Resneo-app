import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/client';
import { posFetch, posPaths } from '@/lib/pos/api';
import { posPhotoUpload } from '@/lib/pos/upload';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePosGate } from '@/lib/queries/usePos';
import type {
  PosCashDuePerson,
  PosDenominations,
  PosEndOfDayResponse,
  PosTillCountResult,
  PosTillSessionDetail,
  PosTillSessionsResponse,
} from '@/types/pos';

/**
 * Till sessions, cash-up and end of day in the app (POS app step 3, plan P7-10; UX spec §7,
 * §13.5), over the web's Pass 3 routes (`/api/venue/pos/sessions*`, `/tills/[id]/sessions`,
 * `/tips/cash-due`, `/end-of-day`).
 *
 * THE GATE: like every POS query, nothing here is asked unless the venue's `pos_enabled` is on, and
 * the screens ask only while the venue counts cash in till sessions (`cash_management_enabled`).
 *
 * Every write that creates something (opening, a movement) carries a `client_request_id` minted
 * once per sheet by the caller, so a retry or a double tap is recorded once. Session writes answer
 * the session as the GET does, which replaces the cached one.
 */

/** `GET /api/venue/pos/sessions`: every till, its open session, the cash settings and what this person may do. */
export function useTillSessions(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.tillSessions(accessToken),
    enabled,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: () => posFetch<PosTillSessionsResponse>(posPaths.tillSessions, { accessToken: accessToken! }),
  });
}

/** One session: its movements, newest first, and its X report (open) or Z report (closed). */
export function useTillSession(sessionId: string | null | undefined, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate((options.enabled ?? true) && Boolean(sessionId));
  return useQuery({
    queryKey: queryKeys.pos.tillSession(accessToken, sessionId ?? null),
    enabled,
    staleTime: 5_000,
    retry: false,
    queryFn: () => posFetch<PosTillSessionDetail>(posPaths.tillSession(sessionId!), { accessToken: accessToken! }),
  });
}

/** After a session write: the session as answered, and the tills list, the reports and the end of day. */
function afterSessionWrite(queryClient: QueryClient, accessToken: string | null, detail: PosTillSessionDetail | null): void {
  if (detail?.session) queryClient.setQueryData(queryKeys.pos.tillSession(accessToken, detail.session.id), detail);
  void queryClient.invalidateQueries({ queryKey: queryKeys.pos.tillSessions(accessToken) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.pos.all(), predicate: (q) => q.queryKey[2] === 'end-of-day' || q.queryKey[2] === 'cash-tips-due' });
}

/**
 * Opens a till with its float (`POST /api/venue/pos/tills/[id]/sessions`, `open_close_till`).
 * `POS_SESSION_ALREADY_OPEN` (someone opened it on another device) carries the open session's id:
 * the tills list is read again so the screen shows it.
 */
export function useOpenTill() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tillId: string;
      clientRequestId: string;
      floatPence: number;
      denominations: PosDenominations | null;
    }): Promise<PosTillSessionDetail> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<PosTillSessionDetail>(posPaths.openTill(input.tillId), {
        accessToken,
        method: 'POST',
        body: {
          client_request_id: input.clientRequestId,
          opening_float_pence: input.floatPence,
          ...(input.denominations ? { opening_denominations: input.denominations } : {}),
        },
      });
    },
    onSuccess: (detail) => afterSessionWrite(queryClient, accessToken, detail),
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pos.tillSessions(accessToken) });
    },
  });
}

export type TillMovementInput =
  | { kind: 'paid_in'; amount_pence: number; category: 'bank' | 'float' | 'other'; note?: string | null; attachment_path?: string | null }
  | {
      kind: 'paid_out';
      amount_pence: number;
      category: 'petty' | 'supplier' | 'expenses' | 'other';
      note?: string | null;
      attachment_path?: string | null;
    }
  | { kind: 'safe_drop'; amount_pence: number; note?: string | null }
  | { kind: 'tips_paid_out'; payouts: { calendar_id?: string; staff_id?: string; amount_pence: number }[] };

/** Paid in, paid out, a safe drop or tips paid out (`paid_in_out`), with the sheet's request id. */
export function useTillMovement(sessionId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clientRequestId: string; movement: TillMovementInput }): Promise<PosTillSessionDetail> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<PosTillSessionDetail>(posPaths.tillSessionAction(sessionId, 'movements'), {
        accessToken,
        method: 'POST',
        body: { client_request_id: input.clientRequestId, ...input.movement },
      });
    },
    onSuccess: (detail) => afterSessionWrite(queryClient, accessToken, detail),
  });
}

/**
 * Uploads a receipt photo for a paid in or out (`.../attachments`, JPG, PNG or WebP under 10 MB)
 * and answers the storage path the movement then names. The photo is private: the till shows it
 * through a short-lived link.
 */
export async function uploadTillReceiptPhoto(
  accessToken: string,
  sessionId: string,
  file: { uri: string; mimeType: string },
): Promise<string> {
  const res = await posPhotoUpload<{ path?: string }>(posPaths.tillSessionAction(sessionId, 'attachments'), accessToken, file, 'receipt');
  if (!res?.path) throw new ApiError("We couldn't save that photo. Please try again.", 500);
  return res.path;
}

/**
 * The blind count (`.../count`, `open_close_till`): records the count (one count and one recount)
 * and answers the difference to whoever counted; the expected figure only to people with
 * `see_expected_cash`.
 */
export function useCountTill(sessionId: string) {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async (input: { countedPence: number; denominations: PosDenominations | null }): Promise<PosTillCountResult> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<PosTillCountResult>(posPaths.tillSessionAction(sessionId, 'count'), {
        accessToken,
        method: 'POST',
        body: {
          counted_cash_pence: input.countedPence,
          ...(input.denominations ? { counted_denominations: input.denominations } : {}),
        },
      });
    },
  });
}

/**
 * Closes the till (`.../close`): the count, the reason when it is out by more than the venue's
 * threshold (400 `POS_VARIANCE_REASON_REQUIRED` otherwise), the cash to the bank and the float
 * left, which must add up to the count. Answers the session with its frozen Z report.
 */
export function useCloseTill(sessionId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      countedPence: number;
      denominations: PosDenominations | null;
      reason: string | null;
      bankPence: number;
      floatPence: number;
    }): Promise<PosTillSessionDetail> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<PosTillSessionDetail>(posPaths.tillSessionAction(sessionId, 'close'), {
        accessToken,
        method: 'POST',
        timeoutMs: 30_000,
        body: {
          counted_cash_pence: input.countedPence,
          ...(input.denominations ? { counted_denominations: input.denominations } : {}),
          ...(input.reason ? { variance_reason: input.reason } : {}),
          cash_to_bank_pence: input.bankPence,
          float_left_pence: input.floatPence,
        },
      });
    },
    onSuccess: (detail) => afterSessionWrite(queryClient, accessToken, detail),
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pos.tillSession(accessToken, sessionId) });
    },
  });
}

/** Emails a closed session's Z report to the venue's admins (`.../email`). Answers how many it went to. */
export function useEmailZReport(sessionId: string) {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async (): Promise<{ sent: number }> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<{ sent: number }>(posPaths.tillSessionAction(sessionId, 'email'), {
        accessToken,
        method: 'POST',
        body: {},
        timeoutMs: 30_000,
      });
    },
  });
}

/** Each team member with cash tips allocated and not yet paid (`paid_in_out`), for "Tips paid out". */
export function useCashTipsDue(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.cashTipsDue(accessToken),
    enabled,
    retry: false,
    queryFn: async () =>
      (await posFetch<{ people: PosCashDuePerson[] }>(posPaths.cashTipsDue, { accessToken: accessToken! })).people ?? [],
  });
}

/** The venue's day (`GET /api/venue/pos/end-of-day?date=`), for admins and `see_expected_cash`. */
export function useEndOfDay(date: string | null, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.endOfDay(accessToken, date),
    enabled,
    retry: false,
    queryFn: () => posFetch<PosEndOfDayResponse>(posPaths.endOfDay(date), { accessToken: accessToken!, timeoutMs: 30_000 }),
  });
}
