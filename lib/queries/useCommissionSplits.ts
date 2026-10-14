import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api/client';
import { commissionPaths, commissionRangeQuery, isStaleSettings, previewQuery, staleSettingsFrom } from '@/lib/commission/api';
import { splitsT } from '@/lib/commission/splits-copy';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { calendarRetryOption } from '@/lib/reports/report-calendar';
import type {
  CommissionPeoplePut,
  CommissionRatePostBody,
  CommissionRatePostResponse,
  CommissionSettingsPatch,
  CommissionSettingsResponse,
  SplitEndBody,
  SplitPreviewParams,
  SplitPreviewResponse,
  SplitProposeBody,
  SplitReportResponse,
  SplitRespondBody,
  SplitResponse,
  SplitSettlementBody,
  SplitsListResponse,
  SplitStatementsResponse,
  SplitTermsBody,
  SplitView,
  SplitWithdrawBody,
  TeamCommissionReport,
} from '@/types/commission-splits';
import type { PosRangeChoice } from '@/types/pos-reports';

/**
 * Commission splits' reads and writes (`/api/venue/commission/*`, the contract agreed 2026-10-14):
 * team rates and settings, splits with other businesses, statements and "Mark as paid", and the two
 * halves of Reports' Commission splits tab. Bearer through `apiFetch`, keys under
 * `queryKeys.commissionSplits`. None of it needs Checkout on, so nothing here reads the POS gate:
 * every read is for admins (the routes refuse anyone else), so it waits for `staff/me` to say this
 * login is one. A team member's own figures ("My sales", `mine=1`) are read on Checkout home by
 * `useMyCommission`.
 *
 * Every write invalidates the whole namespace once it settles, so the settings, the list, the
 * statements and both reports never show the moment before it.
 */

const REPORT_TIMEOUT = 30_000;
const PREVIEW_DELAY_MS = 400;

/** The token, whether this login is an admin, and whether an admin read may run. */
export function useCommissionGate(extra = true) {
  const accessToken = useAccessToken();
  const staff = useStaffMe();
  const isAdmin = staff.data?.staff?.role === 'admin';
  return {
    accessToken,
    isAdmin,
    staffLoading: staff.isLoading,
    enabled: extra && isAdmin && isBackendConfigured() && accessToken !== null,
  };
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT';

function call<T>(accessToken: string | null, path: string, method: Method = 'GET', body?: unknown, timeoutMs?: number): Promise<T> {
  if (!accessToken) return Promise.reject(new Error(splitsT('app.networkError')));
  return apiFetch<T>(path, {
    accessToken,
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
  });
}

/** After any write: everything Commission splits shows is read again. */
function invalidateAll(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.commissionSplits.all() });
}

// ─── Your team: settings, rates and labels ────────────────────────────────────

/** GET /api/venue/commission/settings: rates, people, categories, VAT basis and what counts. */
export function useCommissionSettings(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = useCommissionGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.commissionSplits.settings(accessToken),
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: () => call<CommissionSettingsResponse>(accessToken, commissionPaths.settings),
  });
}

/**
 * PATCH /api/venue/commission/settings at the loaded version. The answer replaces the cached
 * settings. A 412 `STALE_RESOURCE` (someone else saved first) carries the fresh settings under
 * `settings`, which replace the cached ones (or, without them, the settings are read again) before
 * it rejects, so the screen shows the server's sentence beside the fresh values.
 */
export function usePatchCommissionSettings() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: CommissionSettingsPatch) =>
      call<CommissionSettingsResponse>(accessToken, commissionPaths.settings, 'PATCH', patch),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.commissionSplits.settings(accessToken), data),
    onError: async (error) => {
      if (!isStaleSettings(error)) return;
      const fresh = staleSettingsFrom(error);
      if (fresh) queryClient.setQueryData(queryKeys.commissionSplits.settings(accessToken), fresh);
      else await queryClient.refetchQueries({ queryKey: queryKeys.commissionSplits.settings(accessToken) });
    },
    onSettled: () => invalidateAll(queryClient),
  });
}

/** POST /api/venue/commission/rates: a new dated rate (or a stop). 201 carries the settings too. */
export function usePostCommissionRate() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CommissionRatePostBody) =>
      call<CommissionRatePostResponse>(accessToken, commissionPaths.rates, 'POST', body),
    onSuccess: (data) => {
      const { rate: _rate, ...settings } = data;
      queryClient.setQueryData(queryKeys.commissionSplits.settings(accessToken), settings);
    },
    onSettled: () => invalidateAll(queryClient),
  });
}

/** PUT /api/venue/commission/people: how the report describes one person ("Shown as"). */
export function usePutPersonLabel() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CommissionPeoplePut) =>
      call<CommissionSettingsResponse>(accessToken, commissionPaths.people, 'PUT', body),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.commissionSplits.settings(accessToken), data),
    onSettled: () => invalidateAll(queryClient),
  });
}

// ─── Businesses you work with: the splits ─────────────────────────────────────

/** GET /api/venue/commission/splits: every split this venue is party to, and who it may propose one to. */
export function useSplitsList(options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = useCommissionGate(options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.commissionSplits.splits(accessToken),
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: () => call<SplitsListResponse>(accessToken, commissionPaths.splits),
  });
}

/** The value, once it has stopped changing for `delay` ms. */
function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return settled;
}

/**
 * GET /api/venue/commission/splits/preview: the worked example on last month's figures for the
 * terms being written. Asked once the terms have stopped changing for a moment; null params (no
 * calendar yet, or a rate that is not a number) ask nothing.
 */
export function useSplitPreview(params: SplitPreviewParams | null, options: { delayMs?: number } = {}) {
  const query = params ? previewQuery(params) : null;
  const settled = useSettled(query, options.delayMs ?? PREVIEW_DELAY_MS);
  const { accessToken, enabled } = useCommissionGate(settled !== null && settled === query);
  return useQuery({
    queryKey: queryKeys.commissionSplits.preview(accessToken, settled),
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: () =>
      call<SplitPreviewResponse>(accessToken, commissionPaths.preview(settled!), 'GET', undefined, REPORT_TIMEOUT),
  });
}

/** A split write's answer replaces that split wherever it is cached, before everything is read again. */
function keepSplit(queryClient: QueryClient, accessToken: string | null, split: SplitView) {
  queryClient.setQueryData<SplitsListResponse>(queryKeys.commissionSplits.splits(accessToken), (prev) => {
    if (!prev) return prev;
    const found = prev.splits.some((s) => s.id === split.id);
    return { ...prev, splits: found ? prev.splits.map((s) => (s.id === split.id ? split : s)) : [split, ...prev.splits] };
  });
  queryClient.setQueryData<SplitStatementsResponse>(queryKeys.commissionSplits.statements(accessToken, split.id), (prev) =>
    prev ? { ...prev, split } : prev,
  );
}

function useSplitWrite<V>(request: (accessToken: string | null, vars: V) => Promise<SplitResponse>) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => request(accessToken, vars),
    onSuccess: (data) => keepSplit(queryClient, accessToken, data.split),
    onSettled: () => invalidateAll(queryClient),
  });
}

/** POST /api/venue/commission/splits: propose a split to another business. */
export function useProposeSplit() {
  return useSplitWrite<SplitProposeBody>((token, body) => call<SplitResponse>(token, commissionPaths.splits, 'POST', body));
}

/** POST .../[id]/respond: accept or decline the pending version (the other business proposed it). */
export function useRespondSplit() {
  return useSplitWrite<{ splitId: string; body: SplitRespondBody }>((token, v) =>
    call<SplitResponse>(token, commissionPaths.respond(v.splitId), 'POST', v.body),
  );
}

/** POST .../[id]/terms: propose new terms from a date. */
export function useProposeTerms() {
  return useSplitWrite<{ splitId: string; body: SplitTermsBody }>((token, v) =>
    call<SplitResponse>(token, commissionPaths.terms(v.splitId), 'POST', v.body),
  );
}

/** POST .../[id]/withdraw: withdraw the version you proposed (withdrawing the first withdraws the split). */
export function useWithdrawTerms() {
  return useSplitWrite<{ splitId: string; body: SplitWithdrawBody }>((token, v) =>
    call<SplitResponse>(token, commissionPaths.withdraw(v.splitId), 'POST', v.body),
  );
}

/** POST .../[id]/end: end the split after a last day of today or later. */
export function useEndSplit() {
  return useSplitWrite<{ splitId: string; body: SplitEndBody }>((token, v) =>
    call<SplitResponse>(token, commissionPaths.end(v.splitId), 'POST', v.body),
  );
}

// ─── Statements and "Mark as paid" ────────────────────────────────────────────

/** GET .../[id]/statements: each period newest first, what is outstanding and what is marked paid. */
export function useSplitStatements(splitId: string | null) {
  const { accessToken, enabled } = useCommissionGate(Boolean(splitId));
  return useQuery({
    queryKey: queryKeys.commissionSplits.statements(accessToken, splitId),
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: () => call<SplitStatementsResponse>(accessToken, commissionPaths.statements(splitId!), 'GET', undefined, REPORT_TIMEOUT),
  });
}

function useStatementsWrite<V extends { splitId: string }>(request: (accessToken: string | null, vars: V) => Promise<SplitStatementsResponse>) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => request(accessToken, vars),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(queryKeys.commissionSplits.statements(accessToken, vars.splitId), data);
    },
    onSettled: () => invalidateAll(queryClient),
  });
}

/** POST .../[id]/settlements: mark a closed period as paid, with an optional note. */
export function useMarkPaid() {
  return useStatementsWrite<{ splitId: string; body: SplitSettlementBody }>((token, v) =>
    call<SplitStatementsResponse>(token, commissionPaths.settlements(v.splitId), 'POST', v.body),
  );
}

/** POST .../[id]/settlements/[settlementId]/undo: the period is no longer marked as paid. */
export function useUndoSettlement() {
  return useStatementsWrite<{ splitId: string; settlementId: string }>((token, v) =>
    call<SplitStatementsResponse>(token, commissionPaths.undo(v.splitId, v.settlementId), 'POST'),
  );
}

// ─── Reports: Commission splits ───────────────────────────────────────────────

/**
 * The team half of Reports' Commission splits tab (`GET /api/venue/commission/report`): one row per
 * person for the range, and for one of your own calendars when one is chosen (`calendar_id`, part
 * of the key). Never cached long, so "changed since you exported it" is current.
 */
export function useTeamCommissionReport(choice: PosRangeChoice, options: { enabled?: boolean; calendarId?: string | null } = {}) {
  const { accessToken, enabled } = useCommissionGate(options.enabled ?? true);
  const query = commissionRangeQuery(choice, options.calendarId);
  return useQuery({
    queryKey: queryKeys.commissionSplits.teamReport(accessToken, query),
    enabled,
    staleTime: 0,
    placeholderData: keepPreviousData,
    ...calendarRetryOption(options.calendarId),
    queryFn: () => call<TeamCommissionReport>(accessToken, commissionPaths.report(query), 'GET', undefined, REPORT_TIMEOUT),
  });
}

/** One person's lines (`person=c:...` or `s:...`), for the same range and calendar as the report. */
export function useTeamCommissionLines(choice: PosRangeChoice, personKey: string | null, calendarId: string | null = null) {
  const { accessToken, enabled } = useCommissionGate(Boolean(personKey));
  const query = commissionRangeQuery(choice, calendarId);
  return useQuery({
    queryKey: queryKeys.commissionSplits.teamLines(accessToken, query, personKey),
    enabled,
    staleTime: 0,
    queryFn: () => call<TeamCommissionReport>(accessToken, commissionPaths.reportPerson(query, personKey!), 'GET', undefined, REPORT_TIMEOUT),
  });
}

/** The businesses half (`GET /api/venue/commission/splits/report`): You owe, Owed to you, a row per split. */
export function useSplitsReport(choice: PosRangeChoice, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = useCommissionGate(options.enabled ?? true);
  const query = commissionRangeQuery(choice);
  return useQuery({
    queryKey: queryKeys.commissionSplits.splitsReport(accessToken, query),
    enabled,
    staleTime: 0,
    placeholderData: keepPreviousData,
    queryFn: () => call<SplitReportResponse>(accessToken, commissionPaths.splitsReport(query), 'GET', undefined, REPORT_TIMEOUT),
  });
}

/** One split's lines in the range (`split=<id>`). */
export function useSplitLines(choice: PosRangeChoice, splitId: string | null) {
  const { accessToken, enabled } = useCommissionGate(Boolean(splitId));
  const query = commissionRangeQuery(choice);
  return useQuery({
    queryKey: queryKeys.commissionSplits.splitLines(accessToken, query, splitId),
    enabled,
    staleTime: 0,
    queryFn: () => call<SplitReportResponse>(accessToken, commissionPaths.splitLines(query, splitId!), 'GET', undefined, REPORT_TIMEOUT),
  });
}
