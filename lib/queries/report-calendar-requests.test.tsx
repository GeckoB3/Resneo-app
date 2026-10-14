/**
 * The Reports calendar filter on the wire (the contract shared with the web, 2026-10-12; web
 * 90ff4d17): every report that splits by calendar is sent `calendar_id`, the whole-venue ones
 * (Takings, cash-ups, payouts, vouchers) never are, one calendar's answer is cached apart from
 * another's, and the calendars list reads the server's answer. Also the Takings and Sales reads with Checkout off, which run only where Reports has the
 * server's word that the venue keeps them (`reportsVisible`).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();
let mockPosOn = true;

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  isBackendConfigured: () => true,
}));
// Commission splits reads wait for staff/me to say this login is an admin.
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => ({ data: { staff: { role: 'admin' } }, isLoading: false }) }));
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({ data: { feature_flags: { raw: {}, resolved: { pos_enabled: mockPosOn } } } }),
}));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useBookedRevenue } from '@/lib/queries/useBookedRevenue';
import { useTeamCommissionLines, useTeamCommissionReport } from '@/lib/queries/useCommissionSplits';
import { useNewBookings } from '@/lib/queries/useNewBookings';
import {
  useCashUps,
  usePayoutsRange,
  useSalesRange,
  useTakingsRange,
  useVoucherReport,
} from '@/lib/queries/usePosReports';
import { useReportCalendars } from '@/lib/queries/useReportCalendars';
import { useReports } from '@/lib/queries/useReports';
import { useReportMeasures } from '@/lib/queries/useReportMeasures';

const WEEK = { kind: 'preset', preset: 'this-week' } as const;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, wrapper: Wrapper };
}

/** Every path asked for so far. */
function paths(): string[] {
  return mockApiFetch.mock.calls.map((call) => call[0] as string);
}

/** Waits until every query in the hook's result has answered, so no update lands after the test. */
async function settled(result: { current: Record<string, { isFetching: boolean }> }) {
  await waitFor(() => expect(Object.values(result.current).every((q) => !q.isFetching)).toBe(true));
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (path: string) => ({ path, from: '2026-10-05', to: '2026-10-11' }));
  mockPosOn = true;
});

describe('calendar_id goes to every report that splits by calendar', () => {
  it('sends it to the Overview and Clients, New bookings, Booked value, Sales and Commission', async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({
        overview: useReports('2026-10-01', '2026-10-11', true, 'cal-1'),
        newBookings: useNewBookings({ kind: 'preset', preset: 'this_week' }, 'day', true, 'cal-1'),
        revenue: useBookedRevenue({ kind: 'preset', preset: 'this_week' }, 'day', true, 'cal-1'),
        sales: useSalesRange(WEEK, 'day', { calendarId: 'cal-1' }),
        commission: useTeamCommissionReport(WEEK, { calendarId: 'cal-1' }),
        lines: useTeamCommissionLines(WEEK, 'c:sam', 'cal-1'),
      }),
      { wrapper },
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(6));
    await settled(result);
    expect(paths().sort()).toEqual(
      [
        '/api/venue/reports?from=2026-10-01&to=2026-10-11&calendar_id=cal-1',
        '/api/venue/reports/new-bookings?grain=day&preset=this_week&calendar_id=cal-1',
        '/api/venue/reports/booked-revenue?grain=day&preset=this_week&calendar_id=cal-1',
        '/api/venue/reports/sales?grain=day&preset=this-week&calendar_id=cal-1',
        // Commission splits (2026-10-14): the team report takes no grain.
        '/api/venue/commission/report?preset=this-week&calendar_id=cal-1',
        '/api/venue/commission/report?preset=this-week&calendar_id=cal-1&person=c%3Asam',
      ].sort(),
    );
  });

  it('sends nothing extra for all calendars, exactly as before the filter', async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({
        overview: useReports('2026-10-01', '2026-10-11', true),
        revenue: useBookedRevenue({ kind: 'preset', preset: 'this_week' }, 'day', true, null),
        sales: useSalesRange(WEEK, 'day', { calendarId: null }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
    await settled(result);
    expect(paths().sort()).toEqual(
      [
        '/api/venue/reports?from=2026-10-01&to=2026-10-11',
        '/api/venue/reports/booked-revenue?grain=day&preset=this_week',
        '/api/venue/reports/sales?grain=day&preset=this-week',
      ].sort(),
    );
  });

  it('never sends it to the whole-venue reports: Takings, cash-ups, payouts and vouchers', async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({
        takings: useTakingsRange(WEEK, 'day', { reportsVisible: true }),
        cashUps: useCashUps(WEEK, 'day'),
        payouts: usePayoutsRange(WEEK, 'day'),
        vouchers: useVoucherReport({ from: '2026-10-01', to: '2026-10-11' }, '2026-10-11'),
      }),
      { wrapper },
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(4));
    await settled(result);
    expect(paths().every((path) => !path.includes('calendar_id'))).toBe(true);
  });
});

describe('the Showing picker on the wire (release 1)', () => {
  it('sends a business, everyone together and the comparison to the three bookings reports', async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({
        overview: useReports('2026-10-01', '2026-10-11', true, { business: 'all', compare: 'last_year' }),
        newBookings: useNewBookings({ kind: 'preset', preset: 'this_week' }, 'day', true, { business: 'venue-2', compare: 'previous' }),
        revenue: useBookedRevenue({ kind: 'preset', preset: 'this_week' }, 'day', true, { calendarId: 'partner-cal', compare: 'previous' }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
    await settled(result);
    expect(paths().sort()).toEqual(
      [
        '/api/venue/reports?from=2026-10-01&to=2026-10-11&business=all&compare=last_year',
        '/api/venue/reports/new-bookings?grain=day&preset=this_week&business=venue-2&compare=previous',
        '/api/venue/reports/booked-revenue?grain=day&preset=this_week&calendar_id=partner-cal&compare=previous',
      ].sort(),
    );
  });

  it('keys each scope and comparison apart', () => {
    expect(queryKeys.reports.range('t', 'a', 'b', null, 'all', 'previous')).not.toEqual(
      queryKeys.reports.range('t', 'a', 'b', null, 'venue-2', 'previous'),
    );
    expect(queryKeys.reports.range('t', 'a', 'b', null, 'all', 'previous')).not.toEqual(
      queryKeys.reports.range('t', 'a', 'b', null, 'all', 'last_year'),
    );
  });
});

describe('the salon measures on the wire (release 2)', () => {
  it('sends the range, each Showing choice and the comparison, as the Overview does', async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({
        venue: useReportMeasures('2026-10-01', '2026-10-11', true, { compare: 'previous' }),
        own: useReportMeasures('2026-10-01', '2026-10-11', true, { calendarId: 'cal-1', compare: 'previous' }),
        partnerCal: useReportMeasures('2026-10-01', '2026-10-11', true, { calendarId: 'partner-cal', business: 'venue-2', compare: 'last_year' }),
        business: useReportMeasures('2026-10-01', '2026-10-11', true, { business: 'venue-2', compare: 'previous' }),
        together: useReportMeasures('2026-10-01', '2026-10-11', true, { business: 'all', compare: 'last_year' }),
        bare: useReportMeasures('2026-10-01', '2026-10-11', true),
      }),
      { wrapper },
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(6));
    await settled(result);
    expect(paths().sort()).toEqual(
      [
        '/api/venue/reports/measures?from=2026-10-01&to=2026-10-11&compare=previous',
        '/api/venue/reports/measures?from=2026-10-01&to=2026-10-11&calendar_id=cal-1&compare=previous',
        '/api/venue/reports/measures?from=2026-10-01&to=2026-10-11&calendar_id=partner-cal&compare=last_year',
        '/api/venue/reports/measures?from=2026-10-01&to=2026-10-11&business=venue-2&compare=previous',
        '/api/venue/reports/measures?from=2026-10-01&to=2026-10-11&business=all&compare=last_year',
        '/api/venue/reports/measures?from=2026-10-01&to=2026-10-11',
      ].sort(),
    );
  });

  it('keys each scope, range and comparison apart, and apart from the Overview', () => {
    const key = queryKeys.reports.measures;
    expect(key('t', 'a', 'b', null, 'all', 'previous')).not.toEqual(key('t', 'a', 'b', null, 'venue-2', 'previous'));
    expect(key('t', 'a', 'b', null, 'all', 'previous')).not.toEqual(key('t', 'a', 'b', null, 'all', 'last_year'));
    expect(key('t', 'a', 'b', 'cal-1', null, 'previous')).not.toEqual(key('t', 'a', 'b', null, null, 'previous'));
    expect(key('t', 'a', 'b', null, null, 'previous')).not.toEqual(key('t', 'a', 'c', null, null, 'previous'));
    expect(key('t', 'a', 'b', null, null, 'previous')).not.toEqual(queryKeys.reports.range('t', 'a', 'b', null, null, 'previous'));
  });

  it('asks nothing while it is not enabled (a team member)', async () => {
    const { wrapper } = setup();
    await renderHook(() => useReportMeasures('2026-10-01', '2026-10-11', false), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('one calendar is never cached for another', () => {
  it('keys each calendar apart, and the whole venue apart from both', async () => {
    const { client, wrapper } = setup();
    const { result } = await renderHook(
      () => ({
        all: useReports('2026-10-01', '2026-10-11', true, null),
        hannah: useReports('2026-10-01', '2026-10-11', true, 'cal-hannah'),
        jenny: useReports('2026-10-01', '2026-10-11', true, 'cal-jenny'),
        salesHannah: useSalesRange(WEEK, 'day', { calendarId: 'cal-hannah' }),
        salesJenny: useSalesRange(WEEK, 'day', { calendarId: 'cal-jenny' }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.jenny.isSuccess && result.current.salesJenny.isSuccess).toBe(true));
    await settled(result);
    // Each answer is the one asked for that calendar.
    expect((result.current.all.data as unknown as { path: string }).path).not.toContain('calendar_id');
    expect((result.current.hannah.data as unknown as { path: string }).path).toContain('calendar_id=cal-hannah');
    expect((result.current.jenny.data as unknown as { path: string }).path).toContain('calendar_id=cal-jenny');
    expect((result.current.salesJenny.data as unknown as { path: string }).path).toContain('calendar_id=cal-jenny');
    // Three overview entries and two sales entries in the cache.
    expect(client.getQueryCache().findAll({ queryKey: queryKeys.reports.all() })).toHaveLength(3);
    expect(client.getQueryCache().findAll({ queryKey: [...queryKeys.pos.all(), 'sales-report'] })).toHaveLength(2);
    expect(queryKeys.reports.range('t', 'a', 'b', 'cal-hannah')).not.toEqual(queryKeys.reports.range('t', 'a', 'b', 'cal-jenny'));
    expect(queryKeys.reports.range('t', 'a', 'b', null)).not.toEqual(queryKeys.reports.range('t', 'a', 'b', 'cal-jenny'));
  });
});

describe('the calendars list', () => {
  it("reads the server's list, in its order", async () => {
    mockApiFetch.mockResolvedValue({
      calendars: [
        { id: 'c1', name: 'Hannah', active: true },
        { id: 'c2', name: 'Old room', active: false },
      ],
    });
    const { wrapper } = setup();
    const { result } = await renderHook(() => useReportCalendars(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(paths()).toEqual(['/api/venue/reports/calendars']);
    expect(result.current.data).toEqual({
      venue: null,
      calendars: [
        { id: 'c1', name: 'Hannah', active: true },
        { id: 'c2', name: 'Old room', active: false },
      ],
      businesses: [],
      together: null,
    });
  });

  it('reads the businesses for an admin, and never for a team member', async () => {
    mockApiFetch.mockResolvedValue({
      venue: { id: 'v1', name: 'Plus 1' },
      calendars: [{ id: 'c1', name: 'Hannah', active: true }],
      businesses: [{ venue_id: 'v2', name: 'Light 3', access: 'collective', all_calendars: true, calendars: [] }],
      together: { name: 'Studio Collective' },
    });
    const { wrapper } = setup();
    const { result } = await renderHook(() => ({ admin: useReportCalendars(), staff: useReportCalendars(true, false) }), { wrapper });
    await waitFor(() => expect(result.current.admin.isSuccess && result.current.staff.isSuccess).toBe(true));
    expect(result.current.admin.data?.businesses.map((b) => b.name)).toEqual(['Light 3']);
    expect(result.current.admin.data?.together).toEqual({ name: 'Studio Collective' });
    expect(result.current.staff.data?.businesses).toEqual([]);
    expect(result.current.staff.data?.together).toBeNull();
  });

  it.each([404, 403])('reads a %s as no calendars, so no picker shows', async (status) => {
    mockApiFetch.mockRejectedValue(new ApiError('Not found', status, { error: 'Not found' }));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useReportCalendars(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ venue: null, calendars: [], businesses: [], together: null });
  });

  it('asks nothing while it is not enabled', async () => {
    const { wrapper } = setup();
    await renderHook(() => useReportCalendars(false), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('Takings and Sales with Checkout off', () => {
  it('read where Reports has the server word that the venue keeps them', async () => {
    mockPosOn = false;
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({
        takings: useTakingsRange(WEEK, 'day', { reportsVisible: true }),
        sales: useSalesRange(WEEK, 'day', { reportsVisible: true }),
        cashUps: useCashUps(WEEK, 'day', { reportsVisible: true }),
        payouts: usePayoutsRange(WEEK, 'day', { reportsVisible: true }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(4));
    await settled(result);
    expect(paths().every((path) => path.startsWith('/api/venue/reports/'))).toBe(true);
  });

  it('stay quiet anywhere else (Checkout home), and vouchers always need Checkout on', async () => {
    mockPosOn = false;
    const { wrapper } = setup();
    const { result } = await renderHook(
      () => ({
        takings: useTakingsRange(WEEK, 'day'),
        sales: useSalesRange(WEEK, 'day'),
        vouchers: useVoucherReport({ from: '2026-10-01', to: '2026-10-11' }, '2026-10-11'),
      }),
      { wrapper },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.takings.fetchStatus).toBe('idle');
    expect(result.current.vouchers.fetchStatus).toBe('idle');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("reads Commission splits' team report with Checkout off (2026-10-14)", async () => {
    mockPosOn = false;
    const { wrapper } = setup();
    const { result } = await renderHook(() => ({ commission: useTeamCommissionReport(WEEK, { calendarId: 'cal-1' }) }), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    await settled(result);
    expect(paths()).toEqual(['/api/venue/commission/report?preset=this-week&calendar_id=cal-1']);
  });
});
