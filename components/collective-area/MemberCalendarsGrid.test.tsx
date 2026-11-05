/**
 * A member sees which calendar offers what, and ticks many at once (web `MemberCalendarsGrid`,
 * 2026-11-05).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';

jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View: MockView } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(MockView, null, children) : null,
  };
});
jest.mock('@/lib/queries/useServicesManage', () => ({
  useManagedServices: () => ({
    data: {
      services: [
        { id: 'svc-cut', name: 'Cut', collective: { role: 'replica' } },
        { id: 'svc-gel', name: 'Gel Manicure', collective: { role: 'replica' } },
        { id: 'svc-own', name: 'Own Facial', collective: { role: 'parked' } },
      ],
      practitioner_services: [
        { practitioner_id: 'cal-jen', service_id: 'svc-cut' },
        { practitioner_id: 'cal-old', service_id: 'svc-gel' },
      ],
    },
  }),
}));
jest.mock('@/lib/queries/usePractitioners', () => ({
  usePractitioners: () => ({
    data: {
      practitioners: [
        { id: 'cal-jen', name: 'Jenny', sort_order: 0, is_active: true },
        { id: 'cal-sam', name: 'Sam', sort_order: 1, is_active: true },
        { id: 'cal-old', name: 'Old Chair', sort_order: 2, is_active: false },
        { id: 'cal-gone', name: 'Gone', sort_order: 3, is_active: false },
      ],
    },
  }),
}));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockHandler: (call: Call) => unknown = () => ({});
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    const call = { path, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined };
    mockCalls.push(call);
    try {
      return Promise.resolve(mockHandler(call));
    } catch (e) {
      return Promise.reject(e);
    }
  },
}));

import { MemberCalendarsGrid } from '@/components/collective-area/MemberCalendarsGrid';

async function renderGrid() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <MemberCalendarsGrid collectiveId="col" collectiveName="Holywood Collective" />
      </QueryClientProvider>,
    );
  });
}
const cell = (service: string, calendar: string) => screen.getByLabelText(`${service} on ${calendar}`);
const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = () => ({ results: [] });
});

describe('MemberCalendarsGrid', () => {
  it('shows which calendar offers what, the page services only, and a switched-off calendar only while it offers one', async () => {
    await renderGrid();
    expect(cell('Cut', 'Jenny').props.accessibilityState.checked).toBe(true);
    expect(cell('Gel Manicure', 'Jenny').props.accessibilityState.checked).toBe(false);
    expect(cell('Gel Manicure', 'Old Chair').props.accessibilityState.checked).toBe(true);
    expect(screen.queryByLabelText('Own Facial on Jenny')).toBeNull();
    expect(screen.queryByLabelText('Cut on Gone')).toBeNull();
    expect(cell('Cut', 'Old Chair').props.accessibilityState.disabled).toBe(true);
  });

  it('ticks a calendar for every service, and saves every change in one request', async () => {
    mockHandler = () => ({ results: [{ service_id: 'svc-cut', ok: true }, { service_id: 'svc-gel', ok: true }] });
    await renderGrid();
    await press(screen.getByLabelText('Offer every service on Sam'));
    await press(cell('Gel Manicure', 'Old Chair'));
    expect(screen.getByText('3 changes not saved')).toBeTruthy();
    await press(screen.getByText('Save changes'));
    await waitFor(() => expect(mockCalls).toHaveLength(1));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Saved. Your calendars are up to date on the Holywood Collective page.'));
    expect(mockCalls[0]).toEqual({
      path: '/api/venue/collectives/col/my-calendars',
      method: 'POST',
      body: {
        changes: [
          { service_id: 'svc-cut', add: ['cal-sam'], remove: [] },
          { service_id: 'svc-gel', add: ['cal-sam'], remove: ['cal-old'] },
        ],
      },
    });
  });

  it('asks once about bookings on a calendar being taken off, then saves with the answer', async () => {
    let first = true;
    mockHandler = () => {
      if (first) {
        first = false;
        throw new ApiError('1 upcoming booking stays booked.', 409, {
          requires_confirmation: true,
          message: '1 upcoming booking is on a calendar you are taking off this service. It stays booked.',
          affected_bookings: [{ id: 'b1', service_name: 'Cut', calendar_name: 'Jenny', guest_name: 'Sam Carter', booking_date: '2031-03-04', booking_time: '10:00' }],
          affected_total: 1,
        });
      }
      return { results: [{ service_id: 'svc-cut', ok: true }] };
    };
    await renderGrid();
    await press(cell('Cut', 'Jenny'));
    await press(screen.getByText('Save changes'));
    expect(await screen.findByText(/Cut with Jenny: Sam Carter/)).toBeTruthy();
    await press(screen.getByText('Take them off and keep the bookings'));
    await waitFor(() => expect(mockCalls).toHaveLength(2));
    expect(mockCalls[1]!.body).toMatchObject({ acknowledge_affected: true });
  });
});
