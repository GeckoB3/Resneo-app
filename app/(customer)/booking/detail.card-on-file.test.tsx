/**
 * A customer's booking secured by a card on file (web Docs/card-on-file-plan.md §5.4, §5.5, C6):
 * "Secured by your saved card (Visa ending 4242)", "This wasn't me" with its confirm and thank-you,
 * and "Remove my saved card" with the server's words, all through
 * `POST /api/v1/me/bookings/[id]/card`. Other card states keep the shared card part.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import type { CustomerBookingDetail } from '@/lib/queries/useCustomerBookings';

import CustomerBookingDetailScreen from './[id]';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'b-1' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/haptics', () => ({ hapticTap: jest.fn(), hapticSuccess: jest.fn(), hapticSelect: jest.fn() }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

jest.mock('@/components/customer/BookingDetailBody', () => ({ BookingDetailBody: () => null }));
jest.mock('@/components/customer/BookingActions', () => ({ BookingActions: () => null }));
jest.mock('@/components/customer/RescheduleSheet', () => ({ RescheduleSheet: () => null }));
jest.mock('@/components/customer/VisitActions', () => ({ VisitActions: () => null }));
jest.mock('@/components/customer/BookingCardHoldCard', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return { BookingCardHoldCard: () => React.createElement(Text, null, 'shared card part') };
});
jest.mock('@/components/ui/ConfirmSheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, View, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ConfirmSheet: (p: { visible: boolean; title: string; message: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onClose: () => void }) =>
      p.visible
        ? React.createElement(
            View,
            { testID: 'confirm-sheet' },
            React.createElement(Text, null, p.title),
            React.createElement(Text, null, p.message),
            React.createElement(Pressable, { onPress: p.onConfirm }, React.createElement(Text, null, `confirm: ${p.confirmLabel}`)),
            React.createElement(Pressable, { onPress: p.onClose }, React.createElement(Text, null, p.cancelLabel)),
          )
        : null,
  };
});

let mockBooking: Partial<CustomerBookingDetail> & { card_hold?: unknown } = {};
jest.mock('@/lib/queries/useCustomerBookings', () => ({
  ...jest.requireActual('@/lib/queries/useCustomerBookings'),
  useCustomerBookingDetail: () => ({ data: mockBooking, isLoading: false, isError: false, refetch: jest.fn() }),
}));
jest.mock('@/lib/queries/useCustomerVisit', () => ({
  useCustomerVisit: () => ({ data: null, isLoading: false, isError: false, refetch: jest.fn() }),
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

const REMOVE_WORDS =
  'It stays saved for your 2 upcoming bookings while their no-show terms apply, until 23 December, and is then deleted.';

let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function booking(onFile: unknown, state = 'held'): typeof mockBooking {
  return {
    booking_id: 'b-1',
    venue_id: 'v-1',
    in_visit: false,
    manage_booking_url: null,
    card_hold: { fee_pence: 1000, state, charged_pence: null, charged_at: null, ...(onFile ? { on_file: onFile } : {}) },
  } as typeof mockBooking;
}

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = () => ({});
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
});
afterEach(() => client.clear());

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('booking screen, card on file', () => {
  it('names the saved card and offers both actions', async () => {
    mockBooking = booking({ saved_here: false, own: true, card: { brand: 'visa', last4: '4242' } });
    await render(<CustomerBookingDetailScreen />, { wrapper: Wrapper });
    expect(screen.getByText('Secured by your saved card (Visa ending 4242)')).toBeTruthy();
    expect(screen.getByText('No-show fee up to £10.00.')).toBeTruthy();
    expect(screen.getByText("This wasn't me")).toBeTruthy();
    expect(screen.getByText('Remove my saved card')).toBeTruthy();
    expect(screen.queryByText('shared card part')).toBeNull();
  });

  it("hides This wasn't me for a card saved in this booking, and Remove for a card the business linked", async () => {
    mockBooking = booking({ saved_here: true, own: true, card: null });
    const first = await render(<CustomerBookingDetailScreen />, { wrapper: Wrapper });
    expect(screen.getByText('Secured by your saved card')).toBeTruthy();
    expect(screen.queryByText("This wasn't me")).toBeNull();
    expect(screen.getByText('Remove my saved card')).toBeTruthy();
    await first.unmount();

    mockBooking = booking({ saved_here: false, own: false, card: null });
    await render(<CustomerBookingDetailScreen />, { wrapper: Wrapper });
    expect(screen.getByText("This wasn't me")).toBeTruthy();
    expect(screen.queryByText('Remove my saved card')).toBeNull();
  });

  it("This wasn't me: confirm, then the thank-you, through the session route", async () => {
    mockBooking = booking({ saved_here: false, own: true, card: null });
    mockHandler = () => ({ success: true, message: "Thank you. Your card won't be used for this booking.", booking_ids: ['b-1'] });
    await render(<CustomerBookingDetailScreen />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByText("This wasn't me"));
    expect(screen.getByText('Not your card?')).toBeTruthy();
    expect(mockCalls).toHaveLength(0);
    await fireEvent.press(screen.getByText("confirm: This wasn't me"));
    expect(await screen.findByText("Thank you. Your card won't be used for this booking.")).toBeTruthy();
    expect(mockCalls).toEqual([{ path: '/api/v1/me/bookings/b-1/card', method: 'POST', body: { action: 'not_me' } }]);
    expect(screen.queryByText('Remove my saved card')).toBeNull();
  });

  it("This wasn't me: the server's refusal is shown", async () => {
    mockBooking = booking({ saved_here: false, own: false, card: null });
    mockHandler = () => {
      throw new ApiError('A fee has already been charged for this booking. Please contact the business.', 409, {});
    };
    await render(<CustomerBookingDetailScreen />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByText("This wasn't me"));
    await fireEvent.press(screen.getByText("confirm: This wasn't me"));
    await flush();
    expect(mockToast.error).toHaveBeenCalledWith('A fee has already been charged for this booking. Please contact the business.');
  });

  it('Remove my saved card: the server words, then Remove card', async () => {
    mockBooking = booking({ saved_here: true, own: true, card: { brand: 'visa', last4: '4242' } });
    mockHandler = (call) => {
      const body = call.body as { preview?: boolean };
      return { success: true, preview: body.preview === true, removed: body.preview !== true, message: REMOVE_WORDS };
    };
    await render(<CustomerBookingDetailScreen />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByText('Remove my saved card'));
    expect(await screen.findByText(REMOVE_WORDS)).toBeTruthy();
    expect(screen.getByText('Remove your saved card?')).toBeTruthy();
    expect(screen.getByText('Keep card')).toBeTruthy();
    await fireEvent.press(screen.getByText('confirm: Remove card'));
    expect(await screen.findByText(`Your card is removed. ${REMOVE_WORDS}`)).toBeTruthy();
    expect(mockToast.success).toHaveBeenCalledWith('Card removed.');
    expect(mockCalls).toEqual([
      { path: '/api/v1/me/bookings/b-1/card', method: 'POST', body: { action: 'remove_card', preview: true } },
      { path: '/api/v1/me/bookings/b-1/card', method: 'POST', body: { action: 'remove_card' } },
    ]);
  });

  it('Remove my saved card: Keep card closes without removing', async () => {
    mockBooking = booking({ saved_here: true, own: true, card: null });
    mockHandler = () => ({ success: true, preview: true, removed: false, message: 'It will be deleted now.' });
    await render(<CustomerBookingDetailScreen />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByText('Remove my saved card'));
    expect(await screen.findByText('It will be deleted now.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep card'));
    expect(screen.queryByTestId('confirm-sheet')).toBeNull();
    expect(mockCalls).toHaveLength(1);
  });

  it('other card states keep the shared card part', async () => {
    mockBooking = booking(null, 'awaiting_card');
    await render(<CustomerBookingDetailScreen />, { wrapper: Wrapper });
    expect(screen.getByText('shared card part')).toBeTruthy();
    expect(screen.queryByText("This wasn't me")).toBeNull();
  });
});
