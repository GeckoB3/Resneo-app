/**
 * The booking screen for one service of a multi-service visit (web split-visit plan 6.5 to 6.7,
 * 8.9): it shows the whole visit and acts on the whole visit, through the `/api/v1/me/visits`
 * routes the web's `GuestVisitPanel` drives.
 *
 * The screen here is opened on a service the business has CANCELLED, as a push or an old link
 * would open it (G5): it must still show the visit, not a dead end. Cancelling shows the server's
 * preview before anything is cancelled, and a change posts exactly the body the web sends.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import type { CustomerBookingDetail } from '@/lib/queries/useCustomerBookings';
import type { CustomerVisit, VisitCancelPreview, VisitChangeOptions } from '@/lib/queries/useCustomerVisit';

import CustomerBookingDetailScreen from '../../app/(customer)/booking/[id]';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b-colour' }),
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

/** The service the screen is opened on: the visit's colour, which the business cancelled. */
const DETAIL: CustomerBookingDetail = {
  booking_id: 'b-colour',
  venue_id: 'v-1',
  venue_name: 'The Beauty Parlour',
  venue_phone: '028 9000 0000',
  booking_date: '2099-11-27',
  booking_time: '13:00:00',
  booking_end_time: '13:45:00',
  party_size: 1,
  status: 'Cancelled',
  booking_model: 'unified_scheduling',
  is_appointment: true,
  practitioner_id: 'cal-1',
  practitioner_name: 'Aisha',
  appointment_service_id: 'svc-1',
  appointment_service_name: 'Colour',
  event_name: null,
  class_type_name: null,
  resource_name: null,
  deposit_paid: false,
  deposit_amount_pence: null,
  cancellation_deadline: null,
  refund_notice_hours: 24,
  guest_attendance_confirmed_at: null,
  part_of_course: false,
  in_visit: true,
  location: { type: 'venue', address: '1 High Street', map_url: null },
  notes: [],
  compliance_forms: [],
  compliance_forms_checked: true,
};

function visitWith(overrides: Partial<CustomerVisit> = {}): CustomerVisit {
  return {
    visit_key: 'visit-1',
    opened_booking_id: 'b-colour',
    multi_service: true,
    lead_booking_id: 'b-cut',
    span: { date: '2099-11-27', start: '13:45', end: '15:00' },
    state: 'live',
    services: [
      {
        booking_id: 'b-colour',
        booking_date: '2099-11-27',
        start_time: '13:00',
        end_time: '13:45',
        service_name: 'Colour',
        person_name: 'Aisha',
        status: 'Cancelled',
        venue_id: 'v-1',
        confirmed: false,
      },
      {
        booking_id: 'b-cut',
        booking_date: '2099-11-27',
        start_time: '13:45',
        end_time: '14:15',
        service_name: 'Cut',
        person_name: 'Steph',
        status: 'Booked',
        venue_id: 'v-1',
        confirmed: false,
      },
      {
        booking_id: 'b-blow',
        booking_date: '2099-11-27',
        start_time: '14:15',
        end_time: '15:00',
        service_name: 'Blow dry',
        person_name: 'Steph',
        status: 'Confirmed',
        venue_id: 'v-1',
        confirmed: true,
      },
    ],
    businesses: [
      { id: 'v-1', name: 'The Beauty Parlour', phone: '028 9000 0000', email: null, address: '1 High Street' },
    ],
    change: { available: true, reason: null, message: null },
    cancel: { available: true, reason: null, message: null },
    confirm: { available: true, confirmed: false },
    ...overrides,
  };
}

const PREVIEW: VisitCancelPreview = {
  can_cancel: true,
  blocked_reason: null,
  message: null,
  businesses: [
    {
      venue_id: 'v-1',
      name: 'The Beauty Parlour',
      phone: '028 9000 0000',
      refund_pence: 1000,
      kept_pence: 0,
      card_hold_fee_kept_pence: 0,
      notice_hours: 24,
      summary: 'Your £10.00 deposit will be refunded.',
      services: [
        { booking_id: 'b-cut', service_name: 'Cut', booking_date: '2099-11-27', booking_time: '13:45:00' },
        { booking_id: 'b-blow', service_name: 'Blow dry', booking_date: '2099-11-27', booking_time: '14:15:00' },
      ],
    },
  ],
};

const EXPECTED = [
  { booking_id: 'b-cut', updated_at: '2099-11-01T10:00:00.000Z' },
  { booking_id: 'b-blow', updated_at: '2099-11-01T10:00:01.000Z' },
];

const OPTIONS: VisitChangeOptions = {
  can_change: true,
  blocked_reason: null,
  message: null,
  date: '2099-11-27',
  starts: [
    {
      start_time: '16:00',
      services: [
        { booking_id: 'b-cut', start_time: '16:00', end_time: '16:30' },
        { booking_id: 'b-blow', start_time: '16:30', end_time: '17:15' },
      ],
    },
  ],
  expected: EXPECTED,
};

let mockVisit: CustomerVisit = visitWith();

/**
 * The server, by path: every read and write the screen makes goes through here.
 *
 * The screen is opened on the cancelled colour (`b-colour`), which reads fine. The actions must go
 * through a LIVE service (`b-cut`): the real server refuses cancel and confirm through a cancelled
 * one with ALREADY_CANCELLED, and so does this one.
 */
function serve(path: string, opts: { method?: string } = {}): unknown {
  if (path === '/api/v1/me/bookings/b-colour') return DETAIL;
  if (path === '/api/v1/me/visits/b-colour') return mockVisit;
  if (path.startsWith('/api/v1/me/visits/b-colour/')) {
    throw new ApiError('This booking is already cancelled.', 400, { error: 'This booking is already cancelled.' });
  }
  if (path === '/api/v1/me/visits/b-cut/cancel-preview') return PREVIEW;
  if (path.startsWith('/api/v1/me/visits/b-cut/change-options')) return OPTIONS;
  if (path === '/api/v1/me/visits/b-cut/cancel' && opts.method === 'POST') {
    return {
      success: true,
      message: 'Your visit is cancelled. Your payment will be refunded.',
      refund_message: 'Your deposit of £10.00 will be refunded to your original payment method within 5-10 business days.',
      card_hold_message: null,
      cancelled_booking_ids: ['b-cut', 'b-blow'],
    };
  }
  if (path === '/api/v1/me/visits/b-cut/change' && opts.method === 'POST') {
    return { success: true, message: 'Your visit has been moved.', booking_date: '2099-11-27', booking_time: '16:00' };
  }
  if (path === '/api/v1/me/visits/b-cut/confirm' && opts.method === 'POST') {
    return { success: true, message: 'Thanks! Your visit is confirmed. We look forward to seeing you.', confirmed_booking_ids: ['b-cut'] };
  }
  throw new Error(`Unexpected request: ${opts.method ?? 'GET'} ${path}`);
}

function callsTo(path: string) {
  return mockApiFetch.mock.calls.filter(([p]) => p === path);
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
  await screen.findByText('Your visit');
}

afterEach(async () => {
  // Let the refetches an action starts settle inside act, then drop every query and timer.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  client?.clear();
});

beforeEach(() => {
  mockVisit = visitWith();
  mockToastSuccess.mockReset();
  mockApiFetch.mockReset().mockImplementation(async (path: string, opts?: { method?: string }) => serve(path, opts));
});

describe('a cancelled service of a visit opens the whole visit', () => {
  it('lists every service with its time, person and status', async () => {
    await renderScreen();
    expect(screen.getByText('Friday 27 November, 13:45 to 15:00')).toBeTruthy();
    expect(screen.getByText('13:00 Colour')).toBeTruthy();
    expect(screen.getByText('13:45 Cut')).toBeTruthy();
    expect(screen.getByText('14:15 Blow dry')).toBeTruthy();
    expect(screen.getByText('with Steph, 13:45 to 14:15')).toBeTruthy();
    // The business cancelled the colour; the rest of the visit stays.
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getByText('Confirmed')).toBeTruthy();
    expect(screen.getByText('BOOKED')).toBeTruthy();
  });

  it('offers the whole-visit actions, never the single-service ones', async () => {
    await renderScreen();
    expect(screen.getByText("I'm coming")).toBeTruthy();
    expect(screen.getByText('Change date or time')).toBeTruthy();
    expect(screen.getByText('Cancel visit')).toBeTruthy();
    expect(screen.queryByText('Cancel this booking')).toBeNull();
    // The single-service reschedule is refused for a visit (409 part_of_visit), so it is never asked.
    expect(mockApiFetch.mock.calls.some(([p]) => String(p).includes('reschedule'))).toBe(false);
  });

  it("shows the server's reason when an action is not available", async () => {
    mockVisit = visitWith({
      change: {
        available: false,
        reason: 'started',
        message: "Your visit has started, so it can't be changed online. Please speak to The Beauty Parlour.",
      },
      cancel: {
        available: false,
        reason: 'started',
        message: "Your visit has started, so it can't be changed online. Please speak to The Beauty Parlour.",
      },
    });
    await renderScreen();
    expect(screen.queryByText('Change date or time')).toBeNull();
    expect(screen.queryByText('Cancel visit')).toBeNull();
    // Said once, although both actions are blocked for the same reason.
    expect(screen.getAllByText(/Your visit has started/)).toHaveLength(1);
  });

  it('shows a visit every service of which is cancelled as cancelled, with nothing to do', async () => {
    mockVisit = visitWith({
      state: 'cancelled',
      span: null,
      services: visitWith().services.map((s) => ({ ...s, status: 'Cancelled' })),
      change: { available: false, reason: 'cancelled', message: null },
      cancel: { available: false, reason: 'cancelled', message: null },
      confirm: { available: false, confirmed: false },
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await render(
      <QueryClientProvider client={client}>
        <CustomerBookingDetailScreen />
      </QueryClientProvider>,
    );
    await screen.findByText('This visit is cancelled.');
    expect(screen.getByText('CANCELLED')).toBeTruthy();
    expect(screen.queryByText('Cancel visit')).toBeNull();
    expect(screen.queryByText('Change date or time')).toBeNull();
  });
});

describe('cancelling the visit', () => {
  it('shows what is cancelled and refunded before anything is cancelled', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Cancel visit'));

    await screen.findByText('Your £10.00 deposit will be refunded.');
    expect(within(screen.getByTestId('visit-cancel-preview')).getByText('13:45 Cut')).toBeTruthy();
    expect(screen.getByText('This cancels every service in your visit and cannot be undone.')).toBeTruthy();
    expect(callsTo('/api/v1/me/visits/b-cut/cancel')).toHaveLength(0);

    await fireEvent.press(screen.getByText('Yes, cancel my visit'));
    await waitFor(() => expect(callsTo('/api/v1/me/visits/b-cut/cancel')).toHaveLength(1));
    expect(callsTo('/api/v1/me/visits/b-cut/cancel')[0]![1]).toMatchObject({
      method: 'POST',
      accessToken: 'token-A',
    });
    // What happened to the money stays on screen, not only in a toast.
    expect(
      await screen.findByText(
        'Your visit is cancelled. Your payment will be refunded. Your deposit of £10.00 will be refunded to your original payment method within 5-10 business days.',
      ),
    ).toBeTruthy();
  });

  it("does not cancel when the preview says it can't be cancelled online", async () => {
    mockApiFetch.mockImplementation(async (path: string, opts?: { method?: string }) =>
      path === '/api/v1/me/visits/b-cut/cancel-preview'
        ? { can_cancel: false, blocked_reason: 'started', message: 'Your visit has started.', businesses: [] }
        : serve(path, opts),
    );
    await renderScreen();
    await fireEvent.press(screen.getByText('Cancel visit'));
    await screen.findByText('Your visit has started.');
    await fireEvent.press(screen.getByText('Yes, cancel my visit'));
    expect(callsTo('/api/v1/me/visits/b-cut/cancel')).toHaveLength(0);
  });
});

describe('changing the date or time', () => {
  it('asks for the starts on the visit day, then posts the start with the expected versions', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Change date or time'));

    await waitFor(() =>
      expect(callsTo('/api/v1/me/visits/b-cut/change-options?date=2099-11-27')).toHaveLength(1),
    );
    await fireEvent.press(await screen.findByText('16:00'));

    // The old and new plans side by side, each service keeping its person.
    expect(screen.getByText('Fri 27 Nov, 16:00 Cut with Steph')).toBeTruthy();
    expect(screen.getByText('Fri 27 Nov, 16:30 Blow dry with Steph')).toBeTruthy();
    expect(screen.getByText('Fri 27 Nov, 13:45 Cut')).toBeTruthy();

    await fireEvent.press(screen.getByText('Move my visit'));
    await waitFor(() => expect(callsTo('/api/v1/me/visits/b-cut/change')).toHaveLength(1));
    const [, opts] = callsTo('/api/v1/me/visits/b-cut/change')[0] as [string, { method: string; body: string }];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ booking_date: '2099-11-27', booking_time: '16:00', expected: EXPECTED });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Your visit has been moved.'));
  });
});

describe("I'm coming", () => {
  it('confirms the whole visit', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText("I'm coming"));
    await waitFor(() => expect(callsTo('/api/v1/me/visits/b-cut/confirm')).toHaveLength(1));
    expect(callsTo('/api/v1/me/visits/b-cut/confirm')[0]![1]).toMatchObject({ method: 'POST' });
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Thanks! Your visit is confirmed. We look forward to seeing you.'),
    );
  });
});

// The project has no `@types/node` (it is an Expo app); see sheet-scroll-contract.test.ts.
declare const __dirname: string;

it('uses no em-dashes in what the visit screens say', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as { join: (...p: string[]) => string };
  for (const file of ['CustomerVisitCards.tsx', 'VisitActions.tsx', 'VisitCancelSheet.tsx', 'VisitChangeSheet.tsx']) {
    expect(fs.readFileSync(path.join(__dirname, file), 'utf8')).not.toContain(String.fromCharCode(0x2014));
  }
});
