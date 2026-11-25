/**
 * The Today screen's "Fees to charge" card (web Docs/fees-to-charge-plan.md §2.1, §2.3, §4): hidden
 * when there is nothing to charge, for anyone who cannot charge (403) and on an older server (404);
 * the heading's count and total; five rows then "Show all"; the deadline in the warning tone when
 * it is close; Charge opens the existing charge panel; Waive asks, posts the release and reads the
 * list again; Keep does nothing; a card that can no longer be charged offers "Send payment link".
 *
 * The route is mocked at `apiFetch` with a real QueryClient, so the hook's own 403/404 handling and
 * the refetch after a waive are what the tests see.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import { lightColors } from '@/theme/index';
import type { FeeToCharge, FeesToChargeResponse } from '@/types/fees-to-charge';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/haptics', () => ({
  hapticSelect: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticTap: jest.fn(),
  hapticWarning: jest.fn(),
  hapticError: jest.fn(),
}));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
let mockRole = 'admin';
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => ({ data: { staff: { role: mockRole } } }) }));

const mockToast = { show: jest.fn(), success: jest.fn(), error: jest.fn(), info: jest.fn(), dismiss: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

/** The existing charge panel, drawn as a marker with the ids it was given. */
const mockPanelProps: { visitId: string; bookingId: string }[] = [];
jest.mock('@/components/bookings/ChargeNoShowPanel', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    ChargeNoShowPanel: (props: { visitId: string; bookingId: string }) => {
      mockPanelProps.push(props);
      return React.createElement(Text, { testID: 'charge-no-show-panel' }, `Charge panel ${props.visitId} ${props.bookingId}`);
    },
  };
});

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

import { FeesToChargeHomeCard } from './FeesToChargeHomeCard';

function fee(n: number, partial: Partial<FeeToCharge> = {}): FeeToCharge {
  return {
    visit_id: `visit-${n}`,
    booking_ids: [`booking-${n}`],
    client_name: `Client ${n}`,
    text: `No-show: Cut and finish with Jenny Ross, Mon 23 Nov, ${n}:00pm`,
    reason: 'no_show',
    amount_pence: 4500,
    currency: 'GBP',
    charge_by: '2026-12-07T23:59:59Z',
    charge_by_label: 'Charge by Mon 7 Dec',
    urgent: false,
    chargeable: true,
    ...partial,
  };
}

function list(items: FeeToCharge[]): FeesToChargeResponse {
  return {
    items,
    count: items.length,
    total_pence: items.reduce((sum, i) => sum + i.amount_pence, 0),
    currency: 'GBP',
  };
}

/** GETs answer `listAnswer` (a body, or an error to throw); POSTs answer `postAnswer`. */
let listAnswer: unknown = list([]);
let postAnswer: unknown = { released_booking_ids: [] };

let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function renderCard() {
  await render(
    <Wrapper>
      <FeesToChargeHomeCard />
    </Wrapper>,
  );
}

const gets = () => mockCalls.filter((c) => c.method === 'GET' && c.path === '/api/venue/fees-to-charge');

beforeEach(() => {
  mockCalls.length = 0;
  mockPanelProps.length = 0;
  mockPush.mockReset();
  Object.values(mockToast).forEach((fn) => fn.mockReset());
  listAnswer = list([]);
  postAnswer = { released_booking_ids: [] };
  mockHandler = (call) => {
    const answer = call.method === 'GET' ? listAnswer : postAnswer;
    if (answer instanceof Error) throw answer;
    return answer;
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
});
afterEach(() => client.clear());

describe('FeesToChargeHomeCard', () => {
  it('is hidden when there is nothing to charge', async () => {
    await renderCard();
    await waitFor(() => expect(gets()).toHaveLength(1));
    expect(screen.queryByText(/to charge/)).toBeNull();
  });

  it('is hidden for anyone who cannot charge (403)', async () => {
    listAnswer = new ApiError('Only admins can charge a no-show fee.', 403, { error: 'Only admins can charge a no-show fee.', code: 'FORBIDDEN' });
    await renderCard();
    await waitFor(() => expect(gets()).toHaveLength(1));
    expect(screen.queryByText(/to charge/)).toBeNull();
  });

  it('is hidden on an older server without the route (404)', async () => {
    listAnswer = new ApiError('Not found', 404);
    await renderCard();
    await waitFor(() => expect(gets()).toHaveLength(1));
    expect(screen.queryByText(/to charge/)).toBeNull();
  });

  it('is hidden when the list cannot be read', async () => {
    listAnswer = new ApiError('Internal server error', 500, { error: 'Internal server error' });
    await renderCard();
    await waitFor(() => expect(gets()).toHaveLength(1));
    expect(screen.queryByText(/to charge/)).toBeNull();
  });

  it('heads the card with the count and total, the count as a badge', async () => {
    listAnswer = list([fee(1), fee(2, { amount_pence: 6000 }), fee(3, { amount_pence: 3000 })]);
    await renderCard();
    expect(await screen.findByText('3 fees to charge · £135.00')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Client 1')).toBeTruthy();
    expect(screen.getByText('No-show: Cut and finish with Jenny Ross, Mon 23 Nov, 1:00pm')).toBeTruthy();
    expect(screen.getAllByText('£45.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Charge by Mon 7 Dec')).toHaveLength(3);
  });

  it('says "1 fee to charge" for one', async () => {
    listAnswer = list([fee(1)]);
    await renderCard();
    expect(await screen.findByText('1 fee to charge · £45.00')).toBeTruthy();
  });

  it('lists five rows, then "Show all N" opens the rest in place', async () => {
    listAnswer = list(Array.from({ length: 7 }, (_, i) => fee(i + 1)));
    await renderCard();
    await screen.findByText('7 fees to charge · £315.00');
    expect(screen.getByText('Client 5')).toBeTruthy();
    expect(screen.queryByText('Client 6')).toBeNull();
    await fireEvent.press(screen.getByText('Show all 7'));
    expect(screen.getByText('Client 6')).toBeTruthy();
    expect(screen.getByText('Client 7')).toBeTruthy();
    expect(screen.queryByText('Show all 7')).toBeNull();
  });

  it('has no "Show all" with five or fewer', async () => {
    listAnswer = list(Array.from({ length: 5 }, (_, i) => fee(i + 1)));
    await renderCard();
    await screen.findByText('5 fees to charge · £225.00');
    expect(screen.queryByText(/Show all/)).toBeNull();
  });

  it('shows a close deadline in the warning tone', async () => {
    listAnswer = list([fee(1, { urgent: true, charge_by_label: 'Charge by Wed 25 Nov' }), fee(2)]);
    await renderCard();
    await screen.findByText('Charge by Wed 25 Nov');
    expect(screen.getByTestId('fee-charge-by-visit-1')).toHaveStyle({ color: lightColors.warning });
    expect(screen.getByTestId('fee-charge-by-visit-2')).not.toHaveStyle({ color: lightColors.warning });
  });

  it('Charge opens the existing charge panel for that visit', async () => {
    listAnswer = list([fee(1, { visit_id: 'group-9', booking_ids: ['booking-a', 'booking-b'] })]);
    await renderCard();
    await screen.findByText('1 fee to charge · £45.00');
    expect(screen.queryByTestId('charge-no-show-panel')).toBeNull();
    await fireEvent.press(screen.getByText('Charge'));
    expect(screen.getByTestId('charge-no-show-panel')).toBeTruthy();
    expect(mockPanelProps[mockPanelProps.length - 1]).toMatchObject({ visitId: 'group-9', bookingId: 'booking-a' });
  });

  it('Waive asks first, posts the release and reads the list again', async () => {
    listAnswer = list([fee(1, { client_name: 'Sam Client' })]);
    postAnswer = { released_booking_ids: ['booking-1'] };
    await renderCard();
    await screen.findByText('1 fee to charge · £45.00');
    await fireEvent.press(screen.getByText('Waive'));
    expect(screen.getByText('Waive this fee?')).toBeTruthy();
    expect(
      screen.getByText('Waive the £45.00 no-show fee for Sam Client? Their card will no longer be held for this booking.'),
    ).toBeTruthy();
    expect(mockCalls.filter((c) => c.method === 'POST')).toHaveLength(0);

    listAnswer = list([]);
    await fireEvent.press(screen.getByText('Waive fee'));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Fee waived for Sam Client.'));
    expect(mockCalls.filter((c) => c.method === 'POST')).toEqual([
      { path: '/api/venue/visits/visit-1/charge-no-show', method: 'POST', body: { action: 'release' } },
    ]);
    await waitFor(() => expect(gets()).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText(/to charge/)).toBeNull());
    expect(screen.queryByText('Waive this fee?')).toBeNull();
  });

  it('names a late cancellation in the Waive question', async () => {
    listAnswer = list([fee(1, { client_name: 'Sam Client', reason: 'late_cancellation', text: 'Cancelled late: Cut' })]);
    await renderCard();
    await screen.findByText('1 fee to charge · £45.00');
    await fireEvent.press(screen.getByText('Waive'));
    expect(
      screen.getByText(
        'Waive the £45.00 late-cancellation fee for Sam Client? Their card will no longer be held for this booking.',
      ),
    ).toBeTruthy();
  });

  it('Keep closes the question and sends nothing', async () => {
    listAnswer = list([fee(1)]);
    await renderCard();
    await screen.findByText('1 fee to charge · £45.00');
    await fireEvent.press(screen.getByText('Waive'));
    await fireEvent.press(screen.getByText('Keep'));
    expect(screen.queryByText('Waive this fee?')).toBeNull();
    expect(mockCalls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(screen.getByText('1 fee to charge · £45.00')).toBeTruthy();
  });

  it('shows a 409 "nothing to waive" as a toast', async () => {
    listAnswer = list([fee(1)]);
    postAnswer = new ApiError('There is no fee to waive for this visit.', 409, {
      error: 'There is no fee to waive for this visit.',
      code: 'CONFLICT',
      message: 'There is no fee to waive for this visit.',
    });
    await renderCard();
    await screen.findByText('1 fee to charge · £45.00');
    await fireEvent.press(screen.getByText('Waive'));
    await fireEvent.press(screen.getByText('Waive fee'));
    await waitFor(() => expect(mockToast.info).toHaveBeenCalledWith('There is no fee to waive for this visit.'));
    expect(mockToast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(gets()).toHaveLength(2));
  });

  it("labels a card that can't be charged and offers Send payment link instead of Charge", async () => {
    listAnswer = list([fee(1, { chargeable: false }), fee(2)]);
    await renderCard();
    await screen.findByText('2 fees to charge · £90.00');
    expect(screen.getByText("Card can't be charged")).toBeTruthy();
    expect(screen.getAllByText('Charge')).toHaveLength(1);
    const before = mockHandler;
    mockHandler = (call) =>
      call.method === 'POST' ? { message: 'Payment link sent to the client by email and text.', payment_link: { url: 'https://x/pay/fee/t' } } : before(call);
    await fireEvent.press(screen.getByText('Send payment link'));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Payment link sent to the client by email and text.'));
    const post = mockCalls.find((c) => c.method === 'POST')!;
    expect(post.path).toBe('/api/venue/visits/visit-1/charge-no-show');
    expect(post.body).toEqual({ action: 'payment_link', lines: [{ booking_id: 'booking-1' }] });
  });

  it('asks for nothing when the person is not an admin', async () => {
    mockRole = 'staff';
    listAnswer = list([fee(1)]);
    await renderCard();
    expect(mockCalls).toHaveLength(0);
    expect(screen.queryByText(/fees? to charge/)).toBeNull();
    mockRole = 'admin';
  });
});
