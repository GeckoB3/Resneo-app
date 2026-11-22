/**
 * The booking screen for one person's appointment of a group booking (web QA 2026-11-21
 * PUBLIC-19): it shows every person by name, cancels one person through the group route (sending
 * only that person's appointments) or everyone, says what cancelling does to each person's money
 * in the server's words, and changes one person with the single-booking reschedule.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { CustomerBookingDetail } from '@/lib/queries/useCustomerBookings';
import type { CustomerGroup } from '@/lib/queries/useCustomerGroup';

import CustomerBookingDetailScreen from '../../app/(customer)/booking/[id]';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b-mum' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/components/customer/RescheduleSheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    RescheduleSheet: ({ booking }: { booking: { booking_id: string } }) =>
      React.createElement(Text, { testID: 'reschedule-sheet' }, `Reschedule ${booking.booking_id}`),
  };
});
jest.mock('@/components/ui/DatePickerField', () => ({ DatePickerField: () => null }));
const mockToastSuccess = jest.fn();
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: mockToastSuccess, error: jest.fn(), info: jest.fn() }),
}));
jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
const mockApiFetch = jest.fn();
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

function detailOf(id: string, service: string, staff: string): CustomerBookingDetail {
  return {
    booking_id: id,
    venue_id: 'v-1',
    venue_name: 'Linden Hair',
    venue_phone: '028 9000 0000',
    booking_date: '2099-01-08',
    booking_time: '11:00:00',
    booking_end_time: '11:30:00',
    party_size: 1,
    status: 'Booked',
    booking_model: 'unified_scheduling',
    is_appointment: true,
    practitioner_id: 'cal-1',
    practitioner_name: staff,
    appointment_service_id: 'svc-1',
    appointment_service_name: service,
    event_name: null,
    class_type_name: null,
    resource_name: null,
    deposit_paid: true,
    deposit_amount_pence: 500,
    cancellation_deadline: null,
    refund_notice_hours: 24,
    guest_attendance_confirmed_at: null,
    part_of_course: false,
    in_visit: true,
    in_group: true,
    location: { type: 'venue', address: '1 High Street', map_url: null },
    notes: [],
    compliance_forms: [],
    compliance_forms_checked: true,
  } as CustomerBookingDetail;
}

const person = (label: string, id: string, staff: string) => ({
  label,
  appointments: [
    { booking_id: id, booking_date: '2099-01-08', start_time: '11:00', end_time: '11:30', service_name: 'Beard Trim', staff_name: staff, status: 'Booked' },
  ],
  state: 'live' as const,
  cancel: { available: true, message: null, booking_ids: [id], consequences: ['Your £5.00 deposit will be refunded.'] },
  change: { available: true, message: null, booking_id: id },
});

const GROUP: CustomerGroup = {
  opened_booking_id: 'b-mum',
  business: { id: 'v-1', name: 'Linden Hair', phone: '028 9000 0000', email: null, address: null, currency: 'GBP' },
  state: 'live',
  people: [person('Mum', 'b-mum', 'Ella'), person('Dad', 'b-dad', 'Aisha')],
  cancel_everyone: { available: true, message: null, booking_ids: ['b-mum', 'b-dad'], consequences: ['Your £10.00 deposit will be refunded.'] },
};

function serve(path: string, opts: { method?: string; body?: string } = {}): unknown {
  if (path === '/api/v1/me/bookings/b-mum') return detailOf('b-mum', 'Beard Trim', 'Ella');
  if (path === '/api/v1/me/bookings/b-dad') return detailOf('b-dad', 'Beard Trim', 'Aisha');
  if (path === '/api/v1/me/groups/b-mum') return GROUP;
  if (path === '/api/v1/me/groups/b-mum/cancel' && opts.method === 'POST') {
    const body = JSON.parse(opts.body ?? '{}') as { booking_ids?: string[]; everyone?: boolean };
    return body.everyone
      ? { success: true, message: 'Everyone in your group is now cancelled.', cancelled_booking_ids: ['b-mum', 'b-dad'], results: [] }
      : {
          success: true,
          message: "Dad's appointment is cancelled. Mum is still booked.",
          cancelled_booking_ids: ['b-dad'],
          results: [
            { booking_id: 'b-dad', person_label: 'Dad', cancelled: true, message: 'Booking cancelled.', refund_message: 'Your deposit of £5.00 will be refunded to your original payment method within 5-10 business days.', card_hold_message: null, card_hold_kept: false },
          ],
        };
  }
  throw new Error(`Unexpected request: ${opts.method ?? 'GET'} ${path}`);
}

let client: QueryClient;

async function renderScreen() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  await render(
    <QueryClientProvider client={client}>
      <CustomerBookingDetailScreen />
    </QueryClientProvider>,
  );
  await screen.findByText('YOUR GROUP BOOKING');
}

afterEach(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  client?.clear();
});

beforeEach(() => {
  mockToastSuccess.mockReset();
  mockApiFetch.mockReset().mockImplementation(async (path: string, opts?: { method?: string; body?: string }) => serve(path, opts));
});

describe("one person's appointment opens the whole group (PUBLIC-19)", () => {
  it('lists every person by name with their service, staff and time', async () => {
    await renderScreen();
    const people = screen.getAllByTestId('group-person');
    expect(people).toHaveLength(2);
    expect(within(people[0]!).getByText('Mum')).toBeTruthy();
    expect(within(people[0]!).getByText('with Ella, Thursday 8 January, 11:00 to 11:30')).toBeTruthy();
    expect(within(people[1]!).getByText('Dad')).toBeTruthy();
    expect(within(people[1]!).getByText('with Aisha, Thursday 8 January, 11:00 to 11:30')).toBeTruthy();
    // The single person's deposit line is not shown as if it were the group's.
    expect(screen.queryByText('DEPOSIT')).toBeNull();
  });

  it("cancels only Dad, after saying what happens to his deposit", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText("Cancel Dad's appointment"));
    const sheet = screen.getByTestId('group-cancel-sheet');
    expect(within(sheet).getByText('Everyone else in your group stays booked. This cannot be undone.')).toBeTruthy();
    expect(within(sheet).getByText('Your £5.00 deposit will be refunded.')).toBeTruthy();
    await fireEvent.press(within(sheet).getByText('Yes, cancel'));
    await waitFor(() => expect(screen.getByTestId('group-notice')).toBeTruthy());
    const call = mockApiFetch.mock.calls.find(([p]) => p === '/api/v1/me/groups/b-mum/cancel');
    expect(JSON.parse((call![1] as { body: string }).body)).toEqual({ booking_ids: ['b-dad'] });
    expect(screen.getByText("Dad's appointment is cancelled. Mum is still booked.")).toBeTruthy();
    expect(
      screen.getByText('Your deposit of £5.00 will be refunded to your original payment method within 5-10 business days.'),
    ).toBeTruthy();
  });

  it('cancels everyone in one request', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Cancel everyone'));
    await fireEvent.press(within(screen.getByTestId('group-cancel-sheet')).getByText('Yes, cancel'));
    await waitFor(() => expect(screen.getByText('Everyone in your group is now cancelled.')).toBeTruthy());
    const call = mockApiFetch.mock.calls.find(([p]) => p === '/api/v1/me/groups/b-mum/cancel');
    expect(JSON.parse((call![1] as { body: string }).body)).toEqual({ everyone: true });
  });

  it("changes Dad's appointment with the single-booking reschedule", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText("Change Dad's appointment"));
    expect(await screen.findByText('Reschedule b-dad')).toBeTruthy();
  });
});
