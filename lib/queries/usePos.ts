import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { posFetch, posPaths, staleSaleFrom, type PosMethod } from '@/lib/pos/api';
import { isPosEnabled } from '@/lib/pos/pos-enabled';
import { queryKeys } from '@/lib/queries/keys';
import { scanCandidates } from '@/lib/retail/scan';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useVenue } from '@/lib/queries/useVenue';
import type {
  PosBarcodeHit,
  PosBootstrap,
  PosCatalogue,
  PosClientPurchasesResponse,
  PosLoyaltyCard,
  PosLoyaltyCardResponse,
  PosMinePeriod,
  PosMyCommission,
  PosSaleRewardsResponse,
  PosClientStoredValue,
  PosQueueResponse,
  PosReportAccess,
  PosReportPreset,
  PosSale,
  PosSaleListResponse,
  PosSaleResponse,
  SalesReport,
  TakingsReport,
  PosVoucherSettingsResponse,
  PosVoucherSummary,
  PosCollectRequestsResponse,
  PosCollectStateResponse,
  PosPayLinksResponse,
  PosPayoutDetail,
  PosPayoutsReport,
  PosReaderList,
  PosSavedCard,
  PosSavedCardsResponse,
} from '@/types/pos';

/**
 * Checkout (POS) queries and writes for the staff app (POS plan P7-1 to P7-4, UX spec §13.2,
 * §13.3).
 *
 * THE GATE: every query here is disabled unless the venue's resolved `pos_enabled` is true, so a
 * venue without POS never sends a single `/api/venue/pos` request (plan §4.22, test plan DEV-04,
 * APP-08). Writes are only reachable from screens that are themselves behind the same gate.
 *
 * Sale writes: every one sends the `version` the app loaded and answers with the whole sale, which
 * replaces the cached one. A 412 POS_SALE_STALE carries the fresh sale: it replaces the cached one
 * too, and the error is rethrown so the screen can say what happened (`stale.notice`). Writes that
 * create something carry a `client_request_id` minted once per tap by the caller
 * (`newPaymentAttemptId`), so a retry or a double tap is recorded once.
 */

/** True only when the venue bootstrap says Checkout is on (see lib/pos/pos-enabled.ts). */
export function usePosEnabled(): boolean {
  const venue = useVenue();
  return isPosEnabled(venue.data);
}

/** The POS gate every Checkout query uses (shared with the products and stock hooks). */
export function usePosGate(extra = true): { accessToken: string | null; enabled: boolean } {
  const accessToken = useAccessToken();
  const posEnabled = usePosEnabled();
  return { accessToken, enabled: extra && posEnabled && isBackendConfigured() && accessToken !== null };
}

/** `GET /api/venue/pos/bootstrap`: settings, capabilities, operators, payment types, presets, tips. */
export function usePosBootstrap(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.bootstrap(accessToken),
    enabled,
    staleTime: 60_000,
    queryFn: () => posFetch<PosBootstrap>(posPaths.bootstrap, { accessToken: accessToken! }),
  });
}

/** `GET /api/venue/pos/catalogue`: services with their options and who does them. */
export function usePosCatalogue(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.catalogue(accessToken),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => posFetch<PosCatalogue>(posPaths.catalogue, { accessToken: accessToken! }),
  });
}

/** "Ready to check out" (`GET /api/venue/pos/queue`). */
export function usePosQueue(date?: string | null, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.queue(accessToken, date ?? null),
    enabled,
    refetchInterval: 60_000,
    queryFn: () => posFetch<PosQueueResponse>(posPaths.queue(date), { accessToken: accessToken! }),
  });
}

/** Open sales (`status=open`) or all sales, with a search on the number or the client. */
export function usePosSaleList(params: { status?: string | null; q?: string | null }, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const path = posPaths.saleList({ status: params.status ?? null, q: params.q ?? null });
  return useQuery({
    queryKey: queryKeys.pos.sales(accessToken, path),
    enabled,
    queryFn: () => posFetch<PosSaleListResponse>(path, { accessToken: accessToken! }),
  });
}

/** How often an open sale is read again while it is on screen: fast while a card is waiting. */
export function saleRefetchInterval(sale: PosSale | undefined): number | false {
  if (!sale) return false;
  if (sale.payment_lock_payment_id || sale.pending_pence > 0) return 3_000;
  if (sale.status === 'open' || sale.status === 'part_paid') return 20_000;
  return false;
}

/** One sale (`GET /api/venue/pos/sales/[id]`), which also settles a card a lost webhook left pending. */
export function usePosSale(saleId: string | null | undefined, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate((options.enabled ?? true) && Boolean(saleId));
  return useQuery({
    queryKey: queryKeys.pos.sale(accessToken, saleId ?? null),
    enabled,
    refetchInterval: (query) => saleRefetchInterval(query.state.data),
    queryFn: async () =>
      (await posFetch<PosSaleResponse>(posPaths.sale(saleId!), { accessToken: accessToken! })).sale,
  });
}

/** Refresh what a sale write can change elsewhere: lists, the queue, reports and the bookings it covers. */
export function invalidateAfterSaleWrite(queryClient: QueryClient, opts: { money: boolean }): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.pos.all(),
    predicate: (q) =>
      q.queryKey[2] !== 'sale' &&
      q.queryKey[2] !== 'bootstrap' &&
      q.queryKey[2] !== 'catalogue' &&
      q.queryKey[2] !== 'voucher-settings' &&
      // Payouts come from Stripe and do not move with a sale.
      q.queryKey[2] !== 'payouts' &&
      q.queryKey[2] !== 'payout-detail',
  });
  if (opts.money) {
    // A POS payment moves the bookings' paid caches (plan §4.4.10): the booking detail, the
    // calendar badge and Today all read them.
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all() });
  }
}

export type StartSaleInput =
  | { clientRequestId: string; source: { type: 'booking'; booking_id: string } }
  | { clientRequestId: string; source: { type: 'blank' }; guestId?: string | null };

/**
 * Start a sale (`POST /api/venue/pos/sales`): from a booking, which opens the sale the booking is
 * already on when there is one (200), or a blank sale (201). Always `channel: 'app'`.
 */
export function useStartSale() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: StartSaleInput): Promise<PosSale> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      const res = await posFetch<PosSaleResponse & { created?: boolean }>(posPaths.sales, {
        accessToken,
        method: 'POST',
        body: {
          client_request_id: input.clientRequestId,
          source: input.source,
          channel: 'app',
          ...(input.source.type === 'blank' && 'guestId' in input && input.guestId ? { guest_id: input.guestId } : {}),
        },
      });
      return res.sale;
    },
    onSuccess: (sale) => {
      queryClient.setQueryData(queryKeys.pos.sale(accessToken, sale.id), sale);
      invalidateAfterSaleWrite(queryClient, { money: false });
    },
  });
}

/** One write to a sale. `action` is the path after the sale ('' for the sale itself). */
export interface SaleWriteInput {
  action: string;
  method?: PosMethod;
  body?: Record<string, unknown>;
  /** Money moved (or may have): refresh bookings and reports too. */
  money?: boolean;
  /** A full path, for writes that are not under `/sales/[id]/` (discount removal, cancel). */
  path?: string;
  timeoutMs?: number;
}

/** What a sale write answers: the whole sale, plus anything the route adds (a payment, a client secret). */
export type SaleWriteResult = {
  sale?: PosSale;
  payment?: PosSale['payments'][number] | null;
  client_secret?: string | null;
  change_given_pence?: number | null;
  replayed?: boolean;
  refunds?: { id: string; payment_id: string; destination: string; amount_pence: number; tip_pence: number; status: string }[];
  sent?: boolean;
  destination?: string;
  [key: string]: unknown;
};

/** The fresh sale a 412 carried, so the screen can show `stale.notice`. */
export class SaleStaleError extends Error {
  constructor(
    message: string,
    readonly sale: PosSale,
  ) {
    super(message);
    this.name = 'SaleStaleError';
  }
}

/**
 * Writes to one sale. The answer's sale replaces the cached one; a stale answer's sale does too,
 * and the write rejects with `SaleStaleError` so nothing is silently re-applied.
 */
export function useSaleWrite(saleId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaleWriteInput): Promise<SaleWriteResult> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      try {
        const path = input.path ?? (input.action ? posPaths.saleAction(saleId, input.action) : posPaths.sale(saleId));
        return await posFetch<SaleWriteResult>(path, {
          accessToken,
          method: input.method ?? 'POST',
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
        });
      } catch (error) {
        const fresh = staleSaleFrom(error);
        if (fresh) {
          queryClient.setQueryData(queryKeys.pos.sale(accessToken, saleId), fresh);
          throw new SaleStaleError(
            "This sale was changed on another device, so we've loaded the latest version. Check it, then carry on.",
            fresh,
          );
        }
        throw error;
      }
    },
    onSuccess: (data, input) => {
      if (data?.sale && data.sale.id === saleId) {
        queryClient.setQueryData(queryKeys.pos.sale(accessToken, saleId), data.sale);
      } else {
        void queryClient.invalidateQueries({ queryKey: queryKeys.pos.sale(accessToken, saleId) });
      }
      invalidateAfterSaleWrite(queryClient, { money: input.money === true });
    },
    onError: (_error, input) => {
      // A money write that timed out may still have landed: read the sale again so the screen
      // shows the truth before anyone tries a second time (the request id makes a retry safe).
      if (input.money) void queryClient.invalidateQueries({ queryKey: queryKeys.pos.sale(accessToken, saleId) });
    },
  });
}

// ─── Gift vouchers and account credit (Pass V) ─────────────────────────────

/**
 * The venue's gift voucher settings (`GET /api/venue/pos/voucher-settings`): the amounts the
 * Vouchers tab offers and the range for another amount. The route answers only while the voucher
 * switch is on, so a refusal (403 `feature_disabled`, or a 404 from a server before Pass V) reads
 * as null: vouchers are simply not sold here.
 */
export function useVoucherSettings(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.voucherSettings(accessToken),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<PosVoucherSettingsResponse | null> => {
      try {
        return await posFetch<PosVoucherSettingsResponse>(posPaths.voucherSettings, { accessToken: accessToken! });
      } catch (error) {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return null;
        throw error;
      }
    },
  });
}

/**
 * A client's account credit and the vouchers they bought or hold
 * (`GET /api/venue/guests/[guestId]/stored-value`). Last four characters only, never a code.
 */
export function useClientStoredValue(guestId: string | null | undefined, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate((options.enabled ?? true) && Boolean(guestId));
  return useQuery({
    queryKey: queryKeys.pos.storedValue(accessToken, guestId ?? null),
    enabled,
    staleTime: 10_000,
    retry: false,
    queryFn: () => posFetch<PosClientStoredValue>(posPaths.guestStoredValue(guestId!), { accessToken: accessToken! }),
  });
}

/**
 * Looks a voucher up by its code (`POST /api/venue/pos/vouchers/lookup`). A plain call rather than
 * a query or a mutation, so the code is never kept in a cache key or a mutation's variables: it
 * travels only in this request's body (plan §4.33.2).
 */
export async function lookupVoucher(accessToken: string, normalisedCode: string): Promise<PosVoucherSummary> {
  const res = await posFetch<{ voucher: PosVoucherSummary }>(posPaths.voucherLookup, {
    accessToken,
    method: 'POST',
    body: { code: normalisedCode },
  });
  return res.voucher;
}

// ─── Reports ────────────────────────────────────────────────────────────────

/** Whether Reports shows Takings and Sales. Asked only at venues with `pos_enabled`. */
export function usePosReportAccess(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.reportAccess(accessToken),
    enabled,
    staleTime: 60_000,
    queryFn: () => posFetch<PosReportAccess>(posPaths.reportAccess, { accessToken: accessToken! }),
  });
}

export function reportQuery(preset: PosReportPreset): string {
  return `preset=${preset}`;
}

export function useTakingsReport(preset: PosReportPreset, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const query = reportQuery(preset);
  return useQuery({
    queryKey: queryKeys.pos.takings(accessToken, query),
    enabled,
    queryFn: () => posFetch<TakingsReport>(posPaths.takings(query), { accessToken: accessToken!, timeoutMs: 30_000 }),
  });
}

export function useSalesReport(preset: PosReportPreset, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const query = reportQuery(preset);
  return useQuery({
    queryKey: queryKeys.pos.salesReport(accessToken, query),
    enabled,
    queryFn: () => posFetch<SalesReport>(posPaths.salesReport(query), { accessToken: accessToken!, timeoutMs: 30_000 }),
  });
}

/**
 * "Your sales and tips" (`app.mine.*`, Pass LC, UX spec §22.3): this person's own figures from
 * `GET /api/venue/pos/commission/report?mine=1&period=`, for every team member: the sales credited
 * to them (their login and the calendars they work on), their tips, and their commission when they
 * hold `see_own_commission` (null otherwise). It replaces app step 1's reading of the Takings and
 * Sales reports, which only logins with `view_reports` could see. A server before Pass LC answers
 * 404, which reads as null: the card is then not shown.
 */
export function useMyCommission(period: PosMinePeriod, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.myCommission(accessToken, period),
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<PosMyCommission | null> => {
      try {
        return await posFetch<PosMyCommission>(posPaths.myCommission(period), { accessToken: accessToken! });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
}

// ─── Products at the till (app step 4, POS plan P7-12, UX spec §3.8) ────────

/**
 * The till's products for a search (`GET /api/venue/pos/catalogue?type=products&q=`): live, sold in
 * store, not backbar-only, each option with its price and stock, and the venue's stock rules.
 * Searched on the server, as the web till does (#19, paged to 50).
 */
export function useProductSearch(q: string, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const term = q.trim();
  return useQuery({
    queryKey: queryKeys.pos.productSearch(accessToken, term),
    enabled,
    staleTime: 15_000,
    placeholderData: (previous) => previous,
    queryFn: () => posFetch<PosCatalogue>(posPaths.productSearch(term), { accessToken: accessToken! }),
  });
}

/**
 * Looks up one scanned barcode (`GET /api/venue/pos/catalogue?barcode=`). A plain call, made once
 * per scan. A code no product the till sells has is a 404: with `reason` ('archived',
 * 'professional', 'not_in_store') and the server's sentence when the venue has it on a product the
 * till may not sell, without one when nobody has it.
 */
export async function lookupBarcode(
  accessToken: string,
  code: string,
): Promise<{ hit: PosBarcodeHit } | { refused: string } | { unknown: true }> {
  try {
    const hit = await posFetch<PosBarcodeHit>(posPaths.barcode(code), { accessToken });
    if (!hit?.product || !hit.product.options?.some((o) => o.id === hit.option_id)) return { unknown: true };
    return { hit };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      const body = error.body as { reason?: unknown; error?: unknown } | undefined;
      if (typeof body?.reason === 'string' && typeof body.error === 'string') return { refused: body.error };
      return { unknown: true };
    }
    throw error;
  }
}

/**
 * A scanned or typed code, tried in each form it may be stored under (`scanCandidates`: a UPC-A
 * read as twelve digits or as an EAN-13 with a 0 in front), scanned form first. The first hit or
 * refusal wins; unknown only when no form is known.
 */
export async function lookupScannedBarcode(
  accessToken: string,
  code: string,
): Promise<{ hit: PosBarcodeHit } | { refused: string } | { unknown: true }> {
  const forms = scanCandidates(code);
  for (const form of forms) {
    const res = await lookupBarcode(accessToken, form);
    if (!('unknown' in res)) return res;
  }
  return { unknown: true };
}

/**
 * A client's lifetime and average spend and the products they bought
 * (`GET /api/venue/guests/[guestId]/purchases`, P4-8). The plan put these on the guest GET; the
 * web serves them from their own route, which only answers at POS venues.
 */
export function useClientPurchases(guestId: string | null | undefined, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate((options.enabled ?? true) && Boolean(guestId));
  return useQuery({
    queryKey: queryKeys.pos.purchases(accessToken, guestId ?? null),
    enabled,
    staleTime: 15_000,
    retry: false,
    queryFn: () => posFetch<PosClientPurchasesResponse>(posPaths.guestPurchases(guestId!), { accessToken: accessToken! }),
  });
}

// ─── Loyalty cards (Pass LC, UX spec §21) ───────────────────────────────────

/**
 * The rewards the sale's client has waiting (`GET /api/venue/pos/sales/[id]/loyalty-reward`), each
 * with its words and whether it can go on this sale. Asked only while loyalty is on, the sale has a
 * client and it can still change; every sale write refreshes it (`invalidateAfterSaleWrite`).
 */
export function useSaleRewards(saleId: string, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.saleRewards(accessToken, saleId),
    enabled,
    staleTime: 10_000,
    retry: false,
    queryFn: () => posFetch<PosSaleRewardsResponse>(posPaths.saleRewards(saleId), { accessToken: accessToken! }),
  });
}

/** A client's loyalty card, its rewards and its history (`GET /api/venue/guests/[guestId]/loyalty-card`). */
export function useLoyaltyCard(guestId: string | null | undefined, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate((options.enabled ?? true) && Boolean(guestId));
  return useQuery({
    queryKey: queryKeys.pos.loyaltyCard(accessToken, guestId ?? null),
    enabled,
    staleTime: 10_000,
    retry: false,
    queryFn: () => posFetch<PosLoyaltyCardResponse>(posPaths.guestLoyaltyCard(guestId!), { accessToken: accessToken! }),
  });
}

/**
 * Adds or takes off stamps with a reason (`POST .../loyalty-card/adjust`, admins and
 * `adjust_loyalty`). The request id is minted by the caller once per form, so a retry writes once.
 * Answers the card as it now stands, and the rewards a full card issued.
 */
export function useAdjustLoyalty(guestId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { delta: number; reason: string; clientRequestId: string }) => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<{ card: PosLoyaltyCard | null; issued_reward_ids: string[]; replayed?: boolean }>(
        posPaths.guestLoyaltyAdjust(guestId),
        {
          accessToken,
          method: 'POST',
          body: { delta: input.delta, reason: input.reason, client_request_id: input.clientRequestId },
        },
      );
    },
    onSuccess: (data) => {
      queryClient.setQueryData<PosLoyaltyCardResponse | undefined>(queryKeys.pos.loyaltyCard(accessToken, guestId), (old) =>
        old ? { ...old, card: data.card } : { card: data.card, can: { adjust: true } },
      );
    },
  });
}

// ─── Card payments (app step 2, POS plan P7-8 and P7-9) ─────────────────────

/** The venue's counter readers with their status, asked of Stripe when `refresh` (the web's `?refresh=1`). */
export function usePosReaders(options: { enabled?: boolean; refresh?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.readers(accessToken),
    enabled,
    staleTime: 15_000,
    queryFn: () => posFetch<PosReaderList>(posPaths.readers(options.refresh === true), { accessToken: accessToken! }),
  });
}

/**
 * The pay links on a sale. Reading them also settles a link payment whose webhook is late, so a
 * waiting link is polled while it is on screen.
 */
export function usePayLinks(saleId: string | null | undefined, options: { enabled?: boolean; poll?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate((options.enabled ?? true) && Boolean(saleId));
  return useQuery({
    queryKey: queryKeys.pos.payLinks(accessToken, saleId ?? null),
    enabled,
    refetchInterval: options.poll ? 4_000 : false,
    queryFn: () => posFetch<PosPayLinksResponse>(posPaths.payLinks(saleId!), { accessToken: accessToken! }),
  });
}

/** A client's saved cards (`GET /api/venue/pos/guests/[guestId]/cards`). Never a Stripe id. */
export function useGuestSavedCards(guestId: string | null | undefined, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate((options.enabled ?? true) && Boolean(guestId));
  return useQuery({
    queryKey: queryKeys.pos.guestCards(accessToken, guestId ?? null),
    enabled,
    staleTime: 15_000,
    retry: false,
    queryFn: () => posFetch<PosSavedCardsResponse>(posPaths.guestCards(guestId!), { accessToken: accessToken! }),
  });
}

/** Removes a client's saved card at their request (needs `take_payment`); answers the cards left. */
export function useRemoveSavedCard(guestId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cardId: string) => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      return posFetch<{ cards: PosSavedCard[]; removed: boolean }>(posPaths.guestCard(guestId, cardId), {
        accessToken,
        method: 'DELETE',
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData<PosSavedCardsResponse | undefined>(queryKeys.pos.guestCards(accessToken, guestId), (old) =>
        old ? { ...old, cards: data.cards } : { cards: data.cards, card_on_file_enabled: true },
      );
    },
  });
}

/**
 * "Waiting for you" (`GET /api/venue/pos/collect-requests?mine=1`, plan §4.36): sales the web till
 * sent to this person, or to any phone. Pushes can be late or lost, so this is read on Today, when
 * the app comes to the foreground, and every 20 seconds while a screen shows it. Only asked when
 * this phone can take a card (`enabled`), and the server answers nothing to a login without
 * `take_payment`.
 */
export function useCollectRequests(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.collectRequests(accessToken),
    enabled,
    staleTime: 5_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: () => posFetch<PosCollectRequestsResponse>(posPaths.collectRequestsMine, { accessToken: accessToken! }),
  });
}

/** Payouts and fees, for admins (`GET /api/venue/reports/payouts`). Instant payouts are v1.x. */
export function usePayouts(preset: PosReportPreset, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const query = reportQuery(preset);
  return useQuery({
    queryKey: queryKeys.pos.payouts(accessToken, query),
    enabled,
    retry: false,
    queryFn: () => posFetch<PosPayoutsReport>(posPaths.payouts(query), { accessToken: accessToken!, timeoutMs: 30_000 }),
  });
}

/** One payout and what it covered. */
export function usePayoutDetail(preset: PosReportPreset, payoutId: string | null, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate((options.enabled ?? true) && Boolean(payoutId));
  const query = reportQuery(preset);
  return useQuery({
    queryKey: queryKeys.pos.payoutDetail(accessToken, query, payoutId),
    enabled,
    retry: false,
    queryFn: () =>
      posFetch<PosPayoutDetail>(posPaths.payoutDetail(query, payoutId!), { accessToken: accessToken!, timeoutMs: 30_000 }),
  });
}

/**
 * One sale sent to this phone (`GET /api/venue/pos/payments/[id]/collect`), read every few seconds
 * while it is open, so the phone learns of a cancel from the desk and of the payment settling.
 */
export function useCollectState(paymentId: string | null | undefined, options: { enabled?: boolean; poll?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate((options.enabled ?? true) && Boolean(paymentId));
  return useQuery({
    queryKey: [...queryKeys.pos.collectRequests(accessToken), 'state', paymentId ?? null] as const,
    enabled,
    retry: false,
    refetchInterval: options.poll ? 3_000 : false,
    queryFn: () => posFetch<PosCollectStateResponse>(posPaths.collectState(paymentId!), { accessToken: accessToken! }),
  });
}
