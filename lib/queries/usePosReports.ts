import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { posFetch } from '@/lib/pos/api';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { usePosGate } from '@/lib/queries/usePos';
import { rangeQuery } from '@/lib/reports/pos-report-format';
import { calendarRetryOption, withCalendarParam } from '@/lib/reports/report-calendar';
import type { PosPayoutDetail, PosPayoutsReport } from '@/types/pos';
import type {
  AddedVoucher,
  CashUpsPayload,
  PosRangeChoice,
  ReportGrain,
  SalesPayload,
  TakingsPayload,
  VoucherDetail,
  VoucherImportResult,
  VoucherListPage,
  VoucherReportPayload,
} from '@/types/pos-reports';

/**
 * Reports' POS tabs (Takings, Sales, Vouchers) with the web's own range and grain: every query
 * carries `rangeQuery(choice, grain)`, exactly the query string the web sends. Like every POS call
 * these go through `posFetch` and only run at venues with `pos_enabled` (`usePosGate`), so a venue
 * without POS sends none of them. Takings, Sales, cash-ups and payouts also run where Reports has
 * the server's word that the venue keeps those reports with Checkout off (`reportsVisible`, plan
 * §4.18); vouchers need Checkout on, as their routes do. Commission splits has its own reads, with
 * or without Checkout (`lib/queries/useCommissionSplits.ts`).
 *
 * The calendar filter (lib/reports/report-calendar.ts): Sales takes `calendarId`, sent as
 * `calendar_id` and so part of the key, so one calendar's figures are never cached for another.
 * Takings (the money journal), cash-ups, payouts and vouchers are the whole venue and are never
 * sent it.
 *
 * Keys sit under `queryKeys.pos.all()`, so a sale write refreshes the reports as it already does
 * (`invalidateAfterSaleWrite`); payouts keep the keys that function leaves alone, because Stripe's
 * payouts do not move with a sale.
 */

const REPORT_TIMEOUT = 30_000;

export interface PosReportQueryOptions {
  enabled?: boolean;
  /**
   * Reports has the server's answer that this venue has Takings and Sales (pos-access `visible`),
   * so the query may run with Checkout off: a venue with past sales keeps its history.
   */
  reportsVisible?: boolean;
}

export interface PosCalendarReportOptions extends PosReportQueryOptions {
  /** One calendar's figures (`calendar_id`); null or absent is the whole venue. */
  calendarId?: string | null;
}

export const posReportPaths = {
  takings: (q: string) => `/api/venue/reports/takings?${q}`,
  sales: (q: string) => `/api/venue/reports/sales?${q}`,
  cashUps: (q: string) => `/api/venue/reports/cash-ups?${q}`,
  payouts: (q: string) => `/api/venue/reports/payouts?${q}`,
  payout: (q: string, id: string) => `/api/venue/reports/payouts?${q}&payout=${encodeURIComponent(id)}`,
  tips: (q: string) => `/api/venue/reports/tips?${q}`,
  voucherReport: (q: string) => `/api/venue/pos/vouchers/report?${q}`,
  vouchers: '/api/venue/pos/vouchers',
  voucher: (id: string) => `/api/venue/pos/vouchers/${encodeURIComponent(id)}`,
  voucherPdf: (id: string) => `/api/venue/pos/vouchers/${encodeURIComponent(id)}/pdf`,
  voucherImport: '/api/venue/pos/vouchers/import',
} as const;

const reportKey = (name: string, accessToken: string | null, ...rest: (string | null)[]) =>
  [...queryKeys.pos.all(), name, keyScope(accessToken), ...rest] as const;

/**
 * Takings: the money journal, always the whole venue (its route ignores `calendar_id`, web
 * 90ff4d17), so never sent a calendar.
 */
export function useTakingsRange(choice: PosRangeChoice, grain: ReportGrain, options: PosReportQueryOptions = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true, { reports: options.reportsVisible });
  const q = rangeQuery(choice, grain);
  return useQuery({
    queryKey: queryKeys.pos.takings(accessToken, q),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => posFetch<TakingsPayload>(posReportPaths.takings(q), { accessToken: accessToken!, timeoutMs: REPORT_TIMEOUT }),
  });
}

export function useSalesRange(choice: PosRangeChoice, grain: ReportGrain, options: PosCalendarReportOptions = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true, { reports: options.reportsVisible });
  const q = withCalendarParam(rangeQuery(choice, grain), options.calendarId);
  return useQuery({
    queryKey: queryKeys.pos.salesReport(accessToken, q),
    enabled,
    placeholderData: keepPreviousData,
    ...calendarRetryOption(options.calendarId),
    queryFn: () => posFetch<SalesPayload>(posReportPaths.sales(q), { accessToken: accessToken!, timeoutMs: REPORT_TIMEOUT }),
  });
}

/** Cash-ups: the whole venue, so never sent a calendar. */
export function useCashUps(choice: PosRangeChoice, grain: ReportGrain, options: PosReportQueryOptions = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true, { reports: options.reportsVisible });
  const q = rangeQuery(choice, grain);
  return useQuery({
    queryKey: reportKey('cash-ups-report', accessToken, q),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => posFetch<CashUpsPayload>(posReportPaths.cashUps(q), { accessToken: accessToken!, timeoutMs: REPORT_TIMEOUT }),
  });
}

/** Payouts and fees, admins only (the route refuses anyone else). The whole venue: never sent a calendar. */
export function usePayoutsRange(choice: PosRangeChoice, grain: ReportGrain, options: PosReportQueryOptions = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true, { reports: options.reportsVisible });
  const q = rangeQuery(choice, grain);
  return useQuery({
    queryKey: queryKeys.pos.payouts(accessToken, q),
    enabled,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: () => posFetch<PosPayoutsReport>(posReportPaths.payouts(q), { accessToken: accessToken!, timeoutMs: REPORT_TIMEOUT }),
  });
}

export function usePayoutDetailRange(
  choice: PosRangeChoice,
  grain: ReportGrain,
  payoutId: string | null,
  options: Pick<PosReportQueryOptions, 'reportsVisible'> = {},
) {
  const { accessToken, enabled } = usePosGate(Boolean(payoutId), { reports: options.reportsVisible });
  const q = rangeQuery(choice, grain);
  return useQuery({
    queryKey: queryKeys.pos.payoutDetail(accessToken, q, payoutId),
    enabled,
    retry: false,
    queryFn: () =>
      posFetch<PosPayoutDetail>(posReportPaths.payout(q, payoutId!), { accessToken: accessToken!, timeoutMs: REPORT_TIMEOUT }),
  });
}

// ─── Vouchers ─────────────────────────────────────────────────────────────────

export function useVoucherReport(period: { from: string; to: string }, asAt: string, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const q = new URLSearchParams({ from: period.from, to: period.to, as_at: asAt }).toString();
  return useQuery({
    queryKey: reportKey('voucher-report', accessToken, q),
    enabled,
    staleTime: 0,
    placeholderData: keepPreviousData,
    queryFn: () => posFetch<VoucherReportPayload>(posReportPaths.voucherReport(q), { accessToken: accessToken!, timeoutMs: REPORT_TIMEOUT }),
  });
}

/** The query string of "All vouchers" (`format=list`), newest first, `limit` at a time. */
export function voucherListQuery(params: { asAt: string; limit: number; q?: string | null; status?: string | null }): string {
  const p = new URLSearchParams({ format: 'list', as_at: params.asAt, from: params.asAt, to: params.asAt, limit: String(params.limit) });
  if (params.q) p.set('q', params.q);
  if (params.status) p.set('status', params.status);
  return p.toString();
}

export function useVoucherList(params: { asAt: string; limit: number; q?: string | null; status?: string | null }, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = usePosGate(options.enabled ?? true);
  const q = voucherListQuery(params);
  return useQuery({
    queryKey: reportKey('voucher-list', accessToken, q),
    enabled,
    staleTime: 0,
    placeholderData: keepPreviousData,
    queryFn: () => posFetch<VoucherListPage>(posReportPaths.voucherReport(q), { accessToken: accessToken!, timeoutMs: REPORT_TIMEOUT }),
  });
}

export function useVoucherDetail(voucherId: string | null) {
  const { accessToken, enabled } = usePosGate(Boolean(voucherId));
  return useQuery({
    queryKey: reportKey('voucher-detail', accessToken, voucherId),
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: () => posFetch<VoucherDetail>(posReportPaths.voucher(voucherId!), { accessToken: accessToken! }),
  });
}

/** After a voucher changes: the report, the list and any client's stored value read it again. */
function useRefreshVouchers() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.pos.all(),
      predicate: (q) => q.queryKey[2] === 'voucher-report' || q.queryKey[2] === 'voucher-list' || q.queryKey[2] === 'stored-value',
    });
  };
}

export type VoucherAction =
  | { action: 'extend'; expires_on: string | null; reason: string; client_request_id: string }
  | { action: 'adjust'; delta_pence: number; reason: string; client_request_id: string }
  | { action: 'freeze' | 'unfreeze'; reason: string }
  | { action: 'cancel'; reason: string; client_request_id: string }
  | { action: 'resend'; to: string };

/** PATCH /api/venue/pos/vouchers/[id]: the answer is the whole voucher sheet, which replaces the cached one. */
export function useVoucherAction(voucherId: string) {
  const { accessToken } = usePosGate();
  const queryClient = useQueryClient();
  const refresh = useRefreshVouchers();
  return useMutation({
    mutationFn: (body: VoucherAction) =>
      posFetch<VoucherDetail>(posReportPaths.voucher(voucherId), { accessToken: accessToken!, method: 'PATCH', body }),
    onSuccess: (detail) => {
      queryClient.setQueryData(reportKey('voucher-detail', accessToken, voucherId), detail);
      refresh();
    },
  });
}

export interface AddExistingVoucherInput {
  client_request_id: string;
  code?: string;
  balance_pence: number;
  expires_on: string | null;
  holder_name?: string;
  holder_email?: string;
  guest_id?: string;
  note?: string;
}

/** POST /api/venue/pos/vouchers `{ kind: 'existing_voucher' }` (`manage_vouchers`). */
export function useAddExistingVoucher() {
  const { accessToken } = usePosGate();
  const refresh = useRefreshVouchers();
  return useMutation({
    mutationFn: (input: AddExistingVoucherInput) =>
      posFetch<AddedVoucher>(posReportPaths.vouchers, { accessToken: accessToken!, method: 'POST', body: { kind: 'existing_voucher', ...input } }),
    onSuccess: () => refresh(),
  });
}

export interface VoucherImportInput {
  csv: string;
  dry_run: boolean;
  new_codes: boolean;
  columns: Record<string, string>;
}

/** POST /api/venue/pos/vouchers/import: a dry run checks every row, the real run imports them. */
export function useVoucherImport() {
  const { accessToken } = usePosGate();
  const refresh = useRefreshVouchers();
  return useMutation({
    mutationFn: (input: VoucherImportInput) =>
      posFetch<VoucherImportResult>(posReportPaths.voucherImport, { accessToken: accessToken!, method: 'POST', body: input, timeoutMs: 60_000 }),
    onSuccess: (result) => {
      if (!result.dry_run) refresh();
    },
  });
}
