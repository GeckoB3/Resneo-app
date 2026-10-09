import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { isBackendConfigured } from '@/lib/env';
import { posFetch, posPaths, staleSaleFrom, type PosMethod } from '@/lib/pos/api';
import { isPosEnabled } from '@/lib/pos/pos-enabled';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useVenue } from '@/lib/queries/useVenue';
import type {
  PosBootstrap,
  PosCatalogue,
  PosQueueResponse,
  PosReportAccess,
  PosReportPreset,
  PosSale,
  PosSaleListResponse,
  PosSaleResponse,
  SalesReport,
  TakingsReport,
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

function useGate(extra = true): { accessToken: string | null; enabled: boolean } {
  const accessToken = useAccessToken();
  const posEnabled = usePosEnabled();
  return { accessToken, enabled: extra && posEnabled && isBackendConfigured() && accessToken !== null };
}

/** `GET /api/venue/pos/bootstrap`: settings, capabilities, operators, payment types, presets, tips. */
export function usePosBootstrap(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = useGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.bootstrap(accessToken),
    enabled,
    staleTime: 60_000,
    queryFn: () => posFetch<PosBootstrap>(posPaths.bootstrap, { accessToken: accessToken! }),
  });
}

/** `GET /api/venue/pos/catalogue`: services with their options and who does them. */
export function usePosCatalogue(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = useGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.catalogue(accessToken),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => posFetch<PosCatalogue>(posPaths.catalogue, { accessToken: accessToken! }),
  });
}

/** "Ready to check out" (`GET /api/venue/pos/queue`). */
export function usePosQueue(date?: string | null, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = useGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.pos.queue(accessToken, date ?? null),
    enabled,
    refetchInterval: 60_000,
    queryFn: () => posFetch<PosQueueResponse>(posPaths.queue(date), { accessToken: accessToken! }),
  });
}

/** Open sales (`status=open`) or all sales, with a search on the number or the client. */
export function usePosSaleList(params: { status?: string | null; q?: string | null }, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = useGate(options.enabled ?? true);
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
  const { accessToken, enabled } = useGate((options.enabled ?? true) && Boolean(saleId));
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
    predicate: (q) => q.queryKey[2] !== 'sale' && q.queryKey[2] !== 'bootstrap' && q.queryKey[2] !== 'catalogue',
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
        return await posFetch<SaleWriteResult>(input.path ?? posPaths.saleAction(saleId, input.action), {
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

// ─── Reports ────────────────────────────────────────────────────────────────

/** Whether Reports shows Takings and Sales. Asked only at venues with `pos_enabled`. */
export function usePosReportAccess(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = useGate(options.enabled ?? true);
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
  const { accessToken, enabled } = useGate(options.enabled ?? true);
  const query = reportQuery(preset);
  return useQuery({
    queryKey: queryKeys.pos.takings(accessToken, query),
    enabled,
    queryFn: () => posFetch<TakingsReport>(posPaths.takings(query), { accessToken: accessToken!, timeoutMs: 30_000 }),
  });
}

export function useSalesReport(preset: PosReportPreset, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = useGate(options.enabled ?? true);
  const query = reportQuery(preset);
  return useQuery({
    queryKey: queryKeys.pos.salesReport(accessToken, query),
    enabled,
    queryFn: () => posFetch<SalesReport>(posPaths.salesReport(query), { accessToken: accessToken!, timeoutMs: 30_000 }),
  });
}

/**
 * "Your sales and tips" (`app.mine.*`): this person's line in the Sales report's performers and
 * sellers, and in the tips by person, matched on their login or one of their calendars.
 */
export function myFigures(
  input: {
    sales: SalesReport | undefined;
    takings: TakingsReport | undefined;
  },
  me: { staffId: string | null; calendarIds: string[] },
): { salesPence: number; tipsPence: number } | null {
  if (!input.sales && !input.takings) return null;
  const mine = (row: { staff_id: string | null; calendar_id: string | null }) =>
    (me.staffId != null && row.staff_id === me.staffId) ||
    (row.calendar_id != null && me.calendarIds.includes(row.calendar_id));
  // A line can credit a performer and a seller, so services come from the performer rows and
  // products and other items from the seller rows: nothing is counted twice.
  const performed = (input.sales?.by_performer ?? []).filter(mine).reduce((sum, r) => sum + r.total_pence, 0);
  const sold = (input.sales?.by_seller ?? [])
    .filter(mine)
    .reduce((sum, r) => sum + r.retail_pence + r.other_pence, 0);
  const salesPence = performed + sold;
  const tipsPence = (input.takings?.tips?.by_recipient ?? []).filter(mine).reduce((sum, r) => sum + r.net_pence, 0);
  return { salesPence, tipsPence };
}
