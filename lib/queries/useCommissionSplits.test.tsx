/**
 * Commission splits on the wire (the contract agreed with the web, 2026-10-14): every read and
 * write goes to `/api/venue/commission/*` with the Bearer token and the body the contract names,
 * whether or not Checkout is on; reads wait for staff/me to say this login is an admin; keys sit
 * under `queryKeys.commissionSplits`; a stale settings save reads the settings again; and every
 * write invalidates the namespace once it settles.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();
let mockRole: string | undefined = 'admin';

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  isBackendConfigured: () => true,
}));
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: mockRole ? { staff: { role: mockRole } } : undefined, isLoading: false }),
}));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import {
  useCommissionSettings,
  useEndSplit,
  useMarkPaid,
  usePatchCommissionSettings,
  usePostCommissionRate,
  useProposeSplit,
  useProposeTerms,
  usePutPersonLabel,
  useRespondSplit,
  useSplitLines,
  useSplitPreview,
  useSplitsList,
  useSplitsReport,
  useSplitStatements,
  useTeamCommissionLines,
  useTeamCommissionReport,
  useUndoSettlement,
  useWithdrawTerms,
} from '@/lib/queries/useCommissionSplits';
import type { SplitPreviewParams } from '@/types/commission-splits';

const MONTH = { kind: 'preset', preset: 'this-month' } as const;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, wrapper: Wrapper };
}

/** [path, method, parsed body] for every call so far. */
function calls(): [string, string, unknown][] {
  return mockApiFetch.mock.calls.map((c) => {
    const init = (c[1] ?? {}) as { method?: string; body?: string };
    return [c[0] as string, init.method ?? 'GET', init.body ? JSON.parse(init.body) : undefined];
  });
}

function settings(version = 3) {
  return {
    rates: [],
    people: [],
    categories: [],
    basis: { value: 'net_ex_vat', editable: true, vat_registered: true },
    source: { value: 'checkout', setting: 'auto', checkout_available: true },
    settings_version: version,
    today: '2026-10-14',
    currency: 'GBP',
  };
}

function split(over: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    status: 'active',
    label: 'rent',
    settlement_period: 'monthly',
    role: 'payee',
    payer: { venue_id: 'v-sam', name: 'Sam Cuts' },
    payee: { venue_id: 'v-bloom', name: 'Bloom' },
    partner: { venue_id: 'v-sam', name: 'Sam Cuts' },
    calendar: { id: 'cal-sam', name: 'Sam' },
    proposed_by_you: true,
    created_at: '2026-10-01T09:00:00Z',
    terms: null,
    pending: null,
    history: [],
    ended_on: null,
    end_reason: null,
    ended_by_you: null,
    can: { respond: false, withdraw: false, propose_change: true, end: true },
    ...over,
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (path: string) => ({ path, from: '2026-10-01', to: '2026-10-14' }));
  mockRole = 'admin';
});

describe('the admin gate (no Checkout gate)', () => {
  it('asks nothing for a team member', async () => {
    mockRole = 'staff';
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({
        settings: useCommissionSettings(),
        splits: useSplitsList(),
        team: useTeamCommissionReport(MONTH),
        biz: useSplitsReport(MONTH),
        statements: useSplitStatements('s-1'),
      }),
      { wrapper },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.settings.fetchStatus).toBe('idle');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('reads the settings and the splits with the Bearer token, keyed under commissionSplits', async () => {
    mockApiFetch.mockImplementation(async (path: string) => (path.endsWith('/settings') ? settings() : { splits: [], partners: [] }));
    const { client, wrapper } = setup();
    const { result } = await renderHook(() => ({ settings: useCommissionSettings(), splits: useSplitsList() }), { wrapper });
    await waitFor(() => expect(result.current.settings.isSuccess && result.current.splits.isSuccess).toBe(true));
    expect(calls().map((c) => c[0]).sort()).toEqual(['/api/venue/commission/settings', '/api/venue/commission/splits']);
    expect(mockApiFetch.mock.calls[0]![1]).toMatchObject({ accessToken: 'token-A', method: 'GET' });
    expect(client.getQueryData(queryKeys.commissionSplits.settings('token-A'))).toEqual(settings());
    expect(queryKeys.commissionSplits.settings('token-A')[1]).toBe('commission-splits');
  });
});

describe('your team', () => {
  it('saves the source at the loaded version and keeps the answer', async () => {
    const saved = { ...settings(4), source: { value: 'bookings', setting: 'bookings', checkout_available: true } };
    mockApiFetch.mockResolvedValueOnce(saved);
    const { client, wrapper } = setup();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => usePatchCommissionSettings(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ version: 3, commission_source: 'bookings' });
    });
    expect(calls()[0]).toEqual(['/api/venue/commission/settings', 'PATCH', { version: 3, commission_source: 'bookings' }]);
    expect(client.getQueryData(queryKeys.commissionSplits.settings('token-A'))).toEqual(saved);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.commissionSplits.all() });
  });

  it('keeps the fresh settings a stale save (412 STALE_RESOURCE) carries, and rejects with the sentence', async () => {
    const STALE = "Someone else changed these settings while you were editing. We've loaded their changes. Check them, then save yours again.";
    mockApiFetch.mockImplementation(async () => {
      throw new ApiError(STALE, 412, { error: STALE, code: 'STALE_RESOURCE', settings: settings(6) });
    });
    const { client, wrapper } = setup();
    client.setQueryData(queryKeys.commissionSplits.settings('token-A'), settings(3));
    const { result } = await renderHook(() => usePatchCommissionSettings(), { wrapper });
    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync({ version: 3, commission_source: 'checkout' }).catch((e: unknown) => {
        caught = e;
      });
    });
    expect((caught as ApiError).message).toBe(STALE);
    expect(calls()).toEqual([['/api/venue/commission/settings', 'PATCH', { version: 3, commission_source: 'checkout' }]]);
    expect(client.getQueryData(queryKeys.commissionSplits.settings('token-A'))).toEqual(settings(6));
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('reads the settings again after a stale save that carries none', async () => {
    const STALE = 'Someone else changed these settings. We have loaded their changes.';
    const { client, wrapper } = setup();
    client.setQueryData(queryKeys.commissionSplits.settings('token-A'), settings(3));
    const { result } = await renderHook(() => ({ settings: useCommissionSettings(), patch: usePatchCommissionSettings() }), { wrapper });
    await waitFor(() => expect(result.current.settings.isFetching).toBe(false));
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (_path: string, init: { method?: string }) => {
      if (init.method === 'PATCH') throw new ApiError(STALE, 412, { error: STALE, code: 'STALE_RESOURCE' });
      return settings(5);
    });
    let caught: unknown;
    await act(async () => {
      await result.current.patch.mutateAsync({ version: 3, commission_basis: 'net_inc_vat' }).catch((e: unknown) => {
        caught = e;
      });
    });
    expect((caught as ApiError).status).toBe(412);
    expect(calls().filter((c) => c[0] === '/api/venue/commission/settings' && c[1] === 'GET').length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getQueryData(queryKeys.commissionSplits.settings('token-A'))).toEqual(settings(5)));
    await waitFor(() => expect(result.current.settings.isFetching).toBe(false));
  });

  it('posts a rate with the Checkout body, keeping the settings from the 201', async () => {
    const answer = { rate: { id: 'r-9' }, ...settings(3) };
    mockApiFetch.mockResolvedValueOnce(answer);
    const { client, wrapper } = setup();
    const { result } = await renderHook(() => usePostCommissionRate(), { wrapper });
    const body = { item_type: 'service' as const, category_id: null, calendar_id: 'cal-1', staff_id: null, rate_percent: 40, effective_from: '2026-10-14' };
    await act(async () => {
      await result.current.mutateAsync(body);
    });
    expect(calls()[0]).toEqual(['/api/venue/commission/rates', 'POST', body]);
    expect(client.getQueryData(queryKeys.commissionSplits.settings('token-A'))).toEqual(settings(3));
  });

  it("puts a person's label", async () => {
    mockApiFetch.mockResolvedValueOnce(settings());
    const { wrapper } = setup();
    const { result } = await renderHook(() => usePutPersonLabel(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ person_key: 'c:cal-1', label: 'their_share' });
    });
    expect(calls()[0]).toEqual(['/api/venue/commission/people', 'PUT', { person_key: 'c:cal-1', label: 'their_share' }]);
  });
});

describe('businesses you work with', () => {
  it('proposes a split with the contract body and puts the answer in the list', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(queryKeys.commissionSplits.splits('token-A'), { today: '2026-10-14', splits: [], partners: [] });
    mockApiFetch.mockResolvedValueOnce({ split: split({ status: 'proposed' }) });
    const { result } = await renderHook(() => useProposeSplit(), { wrapper });
    const body = {
      calendar_id: 'cal-sam',
      other_venue_id: 'v-sam',
      label: 'rent' as const,
      settlement_period: 'monthly' as const,
      effective_from: '2026-11-01',
      services_rate_percent: 40,
      products_rate_percent: null,
      vat_basis: 'net_ex_vat' as const,
    };
    await act(async () => {
      await result.current.mutateAsync(body);
    });
    expect(calls()[0]).toEqual(['/api/venue/commission/splits', 'POST', body]);
    const list = client.getQueryData<{ splits: { id: string }[] }>(queryKeys.commissionSplits.splits('token-A'));
    expect(list?.splits.map((s) => s.id)).toEqual(['s-1']);
  });

  it('answers, proposes new terms, withdraws and ends at their own paths', async () => {
    mockApiFetch.mockImplementation(async () => ({ split: split() }));
    const { client, wrapper } = setup();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(
      () => ({ respond: useRespondSplit(), terms: useProposeTerms(), withdraw: useWithdrawTerms(), end: useEndSplit() }),
      { wrapper },
    );
    await act(async () => {
      await result.current.respond.mutateAsync({ splitId: 's-1', body: { terms_id: 't-2', action: 'accept' } });
      await result.current.terms.mutateAsync({
        splitId: 's-1',
        body: { effective_from: '2026-12-01', services_rate_percent: 35, products_rate_percent: 10, vat_basis: 'net_inc_vat' },
      });
      await result.current.withdraw.mutateAsync({ splitId: 's-1', body: { terms_id: 't-3' } });
      await result.current.end.mutateAsync({ splitId: 's-1', body: { last_day: '2026-12-31' } });
    });
    expect(calls()).toEqual([
      ['/api/venue/commission/splits/s-1/respond', 'POST', { terms_id: 't-2', action: 'accept' }],
      [
        '/api/venue/commission/splits/s-1/terms',
        'POST',
        { effective_from: '2026-12-01', services_rate_percent: 35, products_rate_percent: 10, vat_basis: 'net_inc_vat' },
      ],
      ['/api/venue/commission/splits/s-1/withdraw', 'POST', { terms_id: 't-3' }],
      ['/api/venue/commission/splits/s-1/end', 'POST', { last_day: '2026-12-31' }],
    ]);
    expect(invalidate.mock.calls.filter((c) => JSON.stringify(c[0]) === JSON.stringify({ queryKey: queryKeys.commissionSplits.all() }))).toHaveLength(4);
  });

  it('asks for the worked example once the terms settle, leaving products out until included', async () => {
    mockApiFetch.mockImplementation(async () => ({ owed_pence: 36000 }));
    const { wrapper } = setup();
    const base: SplitPreviewParams = {
      calendar_id: 'cal-sam',
      other_venue_id: 'v-sam',
      services_rate_percent: 40,
      products_rate_percent: null,
      vat_basis: 'net_ex_vat',
    };
    const { result, rerender } = await renderHook(
      ({ params }: { params: SplitPreviewParams | null }) => useSplitPreview(params, { delayMs: 1 }),
      { wrapper, initialProps: { params: null as SplitPreviewParams | null } },
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
    await rerender({ params: base });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls()[0]![0]).toBe(
      '/api/venue/commission/splits/preview?calendar_id=cal-sam&other_venue_id=v-sam&services_rate_percent=40&vat_basis=net_ex_vat',
    );
    await rerender({ params: { ...base, products_rate_percent: 12.5 } });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(calls()[1]![0]).toBe(
      '/api/venue/commission/splits/preview?calendar_id=cal-sam&other_venue_id=v-sam&services_rate_percent=40&products_rate_percent=12.5&vat_basis=net_ex_vat',
    );
  });
});

describe('statements and Mark as paid', () => {
  it('reads the statements, marks a period paid with its note, and undoes it', async () => {
    const answer = { split: split(), periods: [], outstanding_pence: 0, paid_pence: 36000, currency: 'GBP', vat_note: false };
    mockApiFetch.mockImplementation(async () => answer);
    const { client, wrapper } = setup();
    const { result } = await renderHook(
      () => ({ statements: useSplitStatements('s-1'), mark: useMarkPaid(), undo: useUndoSettlement() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.statements.isSuccess).toBe(true));
    await act(async () => {
      await result.current.mark.mutateAsync({ splitId: 's-1', body: { period_start: '2026-10-01', note: 'Bank transfer' } });
      await result.current.undo.mutateAsync({ splitId: 's-1', settlementId: 'st-1' });
    });
    expect(calls()[0]).toEqual(['/api/venue/commission/splits/s-1/statements', 'GET', undefined]);
    expect(calls().filter((c) => c[1] !== 'GET')).toEqual([
      ['/api/venue/commission/splits/s-1/settlements', 'POST', { period_start: '2026-10-01', note: 'Bank transfer' }],
      ['/api/venue/commission/splits/s-1/settlements/st-1/undo', 'POST', undefined],
    ]);
    // Each write invalidates the namespace: the statements are read again.
    await waitFor(() => expect(calls().filter((c) => c[1] === 'GET').length).toBeGreaterThan(1));
    await waitFor(() => expect(result.current.statements.isFetching).toBe(false));
    expect(client.getQueryData(queryKeys.commissionSplits.statements('token-A', 's-1'))).toEqual(answer);
  });
});

describe('the two reports', () => {
  it('reads the team report and a person, for a calendar, and the business splits and a split', async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({
        team: useTeamCommissionReport(MONTH, { calendarId: 'cal-1' }),
        person: useTeamCommissionLines(MONTH, 'c:sam', 'cal-1'),
        biz: useSplitsReport({ kind: 'custom', from: '2026-09-01', to: '2026-09-30' }),
        lines: useSplitLines(MONTH, 's-1'),
      }),
      { wrapper },
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(Object.values(result.current).every((q) => !q.isFetching)).toBe(true));
    expect(calls().map((c) => c[0]).sort()).toEqual(
      [
        '/api/venue/commission/report?preset=this-month&calendar_id=cal-1',
        '/api/venue/commission/report?preset=this-month&calendar_id=cal-1&person=c%3Asam',
        '/api/venue/commission/splits/report?from=2026-09-01&to=2026-09-30',
        '/api/venue/commission/splits/report?preset=this-month&split=s-1',
      ].sort(),
    );
  });

  it('asks for no lines until a person or a split is chosen', async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({ person: useTeamCommissionLines(MONTH, null), lines: useSplitLines(MONTH, null) }),
      { wrapper },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.person.fetchStatus).toBe('idle');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
