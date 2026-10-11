/**
 * Checkout home that fits the person (Part 2 mock-up 5, approved 2026-10-11): "New sale" first; the
 * business's day (net takings, sales, tips, from the Takings and Sales reports for today) for admins
 * and team members with `view_reports`; "Needs your attention" for admins from
 * `GET /api/venue/pos/alerts`, each row opening its sale and the card hidden when there is nothing;
 * the queue saying how clients get there; open sales as a list; every sale one tap away; and the
 * person's own sales and tips last, not at all in a one-person business.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
const mockOpenBrowser = jest.fn((_url: string) => Promise.resolve());
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (url: string) => mockOpenBrowser(url) }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
const mockOpen = jest.fn();
jest.mock('@/components/pos/useOpenCheckout', () => ({
  saleHref: (id: string) => `/checkout/${id}`,
  useOpenCheckout: () => ({ open: mockOpen, openingKey: null }),
}));
jest.mock('@/lib/queries/useTill', () => ({ useTillSessions: () => ({ data: undefined }) }));

type Boot = { role: 'admin' | 'staff'; capabilities: Record<string, boolean>; operators: unknown[] };
let mockBoot: Boot;
let mockAlerts: unknown;
let mockAlertsError = false;
let mockQueue: unknown[] = [];
let mockOpenSales: unknown[] = [];
let mockTakingsError = false;
const mockEnabled: Record<string, boolean | undefined> = {};
const mockMinePeriods: string[] = [];
// The person's commission so far, and whether they may see it (`see_own_commission`).
let mockMineCommission: { pence: number | null; can: boolean } = { pence: null, can: false };
jest.mock('@/lib/queries/usePos', () => ({
  usePosEnabled: () => true,
  usePosBootstrap: () => ({
    data: { ...mockBoot, settings: {}, venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' } },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  usePosQueue: () => ({ data: { date: '2026-10-11', bookings: mockQueue }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() }),
  usePosSaleList: () => ({ data: { sales: mockOpenSales, next_cursor: null }, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() }),
  usePosAlerts: (options: { enabled?: boolean } = {}) => {
    mockEnabled.alerts = options.enabled;
    return options.enabled
      ? { data: mockAlertsError ? undefined : mockAlerts, isError: mockAlertsError, refetch: jest.fn() }
      : { data: undefined, isError: false, refetch: jest.fn() };
  },
  useMyCommission: (period: string) => {
    mockMinePeriods.push(period);
    return {
      data: {
        mine: { period, from: '2026-10-11', to: '2026-10-11', sales_pence: 12000, tips_pence: 600, commission_pence: mockMineCommission.pence },
        can: { see_commission: mockMineCommission.can },
        venue: { name: 'Studio', currency: 'GBP' },
      },
      isError: false,
      refetch: jest.fn(),
    };
  },
}));
const mockReportArgs: unknown[][] = [];
jest.mock('@/lib/queries/usePosReports', () => ({
  useTakingsRange: (choice: unknown, grain: unknown, options: { enabled?: boolean } = {}) => {
    mockEnabled.takings = options.enabled;
    mockReportArgs.push(['takings', choice, grain]);
    return options.enabled
      ? {
          data: mockTakingsError
            ? undefined
            : { from: '2026-10-11', to: '2026-10-11', totals: { net_pence: 48650, tips_pence: 1800, payments_pence: 50000, refunds_pence: -1350 } },
          isError: mockTakingsError,
          refetch: jest.fn(),
        }
      : { data: undefined, isError: false, refetch: jest.fn() };
  },
  useSalesRange: (choice: unknown, grain: unknown, options: { enabled?: boolean } = {}) => {
    mockEnabled.sales = options.enabled;
    mockReportArgs.push(['sales', choice, grain]);
    return options.enabled
      ? { data: { from: '2026-10-11', to: '2026-10-11', totals: { sales_count: 11 } }, isError: false, refetch: jest.fn() }
      : { data: undefined, isError: false, refetch: jest.fn() };
  },
}));

import CheckoutHomeScreen from '@/app/(app)/checkout/index';

const SALE = 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1';
const ORDER = 'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2';
const team = [
  { kind: 'calendar', calendar_id: 'c1', staff_id: null, name: 'Andrew' },
  { kind: 'calendar', calendar_id: 'c2', staff_id: null, name: 'Cara' },
];

function openSale(over: Record<string, unknown> = {}) {
  return {
    id: 's27',
    number: 27,
    number_label: '27',
    channel: 'till',
    status: 'open',
    total_pence: 4500,
    balance_due_pence: 4500,
    refund_status: 'none',
    tip_pence: 0,
    client_name: null,
    operator_name: 'Andrew',
    created_by_name: 'Andrew',
    created_at: '2026-10-11T09:12:00Z',
    completed_at: null,
    business_date: '2026-10-11',
    parked: { at: '2026-10-11T09:12:00Z', note: null, device: 'Front desk' },
    card_waiting: false,
    summary: 'Cut and finish',
    line_count: 1,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBoot = { role: 'admin', capabilities: { create_sale: true, view_reports: true }, operators: team };
  mockAlerts = {
    currency: 'GBP',
    alerts: [
      { id: 'al-dispute', kind: 'dispute', created_at: '2026-10-11T10:30:00Z', sale_id: SALE, amount_pence: 400 },
      { id: 'al-refund', kind: 'refund_failed', created_at: '2026-10-11T09:58:00Z', sale_id: SALE, amount_pence: null },
      { id: 'al-stock', kind: 'stock_conflict', created_at: '2026-10-10T08:00:00Z', sale_id: ORDER, amount_pence: null },
      { id: 'al-dispute-2', kind: 'dispute', created_at: '2026-10-09T08:00:00Z', sale_id: null, amount_pence: null },
    ],
  };
  mockAlertsError = false;
  mockQueue = [];
  mockOpenSales = [openSale()];
  mockTakingsError = false;
  mockReportArgs.length = 0;
  mockMinePeriods.length = 0;
  mockMineCommission = { pence: null, can: false };
  for (const k of Object.keys(mockEnabled)) delete mockEnabled[k];
});

describe('the business day', () => {
  it("shows an admin today's net takings, sales and tips from the reports, with a way to Reports", async () => {
    await render(<CheckoutHomeScreen />);
    expect(screen.getByText('Today, Sunday 11 October')).toBeTruthy();
    expect(screen.getByLabelText('Net takings, £486.50')).toBeTruthy();
    expect(screen.getByLabelText('Sales, 11')).toBeTruthy();
    expect(screen.getByLabelText('Tips, £18.00')).toBeTruthy();
    // Today's Takings and Sales, from the reports the app already reads.
    expect(mockReportArgs).toEqual(
      expect.arrayContaining([
        ['takings', { kind: 'preset', preset: 'today' }, 'day'],
        ['sales', { kind: 'preset', preset: 'today' }, 'day'],
      ]),
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('link', { name: 'See Reports' }));
    });
    expect(mockPush).toHaveBeenCalledWith('/reports?tab=takings');
  });

  it('shows them to a team member with view_reports too', async () => {
    mockBoot = { role: 'staff', capabilities: { create_sale: true, view_reports: true }, operators: team };
    await render(<CheckoutHomeScreen />);
    expect(screen.getByLabelText('Net takings, £486.50')).toBeTruthy();
  });

  it('keeps them from a team member without view_reports, and asks for no report', async () => {
    mockBoot = { role: 'staff', capabilities: { create_sale: true }, operators: team };
    await render(<CheckoutHomeScreen />);
    expect(screen.queryByText(/^Today, /)).toBeNull();
    expect(mockEnabled.takings).toBe(false);
    expect(mockEnabled.sales).toBe(false);
  });

  it('says when the figures could not be loaded, with a way to try again', async () => {
    mockTakingsError = true;
    await render(<CheckoutHomeScreen />);
    expect(screen.getByText("We couldn't load today's figures.")).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('puts "New sale" first', async () => {
    await render(<CheckoutHomeScreen />);
    const buttons = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel as string);
    expect(buttons[0]).toBe('New sale');
    await act(async () => {
      fireEvent.press(screen.getByText('New sale'));
    });
    expect(mockOpen).toHaveBeenCalledWith('blank');
  });
});

describe('needs your attention', () => {
  it("lists an admin's alerts in the web's words, each opening its sale or order", async () => {
    await render(<CheckoutHomeScreen />);
    expect(screen.getByText('Needs your attention')).toBeTruthy();
    expect(screen.getByText('A client has disputed a card payment of £4.00. Respond in your Stripe dashboard.')).toBeTruthy();
    expect(screen.getByText("A card refund didn't go through. Refund the client another way.")).toBeTruthy();
    expect(screen.getByText('An online order was paid after its items were released. Check you have them.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: "A card refund didn't go through. Refund the client another way." }));
    });
    expect(mockPush).toHaveBeenLastCalledWith(`/checkout/${SALE}`);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'An online order was paid after its items were released. Check you have them.' }));
    });
    expect(mockPush).toHaveBeenLastCalledWith(`/orders/${ORDER}`);
    // A dispute with no sale opens the payment settings on the web.
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'A client has disputed a card payment. Respond in your Stripe dashboard.' }));
    });
    expect(mockOpenBrowser).toHaveBeenCalledWith(expect.stringMatching(/\/dashboard\/settings\?tab=payments$/));
  });

  it.each([
    ['there is nothing to act on', () => (mockAlerts = { currency: 'GBP', alerts: [] })],
    ['a server before the route answers nothing', () => (mockAlerts = null)],
    ['it cannot be read', () => (mockAlertsError = true)],
  ])('is not there when %s', async (_why, arrange) => {
    arrange();
    await render(<CheckoutHomeScreen />);
    expect(screen.queryByText('Needs your attention')).toBeNull();
    // The rest of the page is unaffected.
    expect(screen.getByText('Ready to pay')).toBeTruthy();
  });

  it('is for admins only: a team member never asks for it', async () => {
    mockBoot = { role: 'staff', capabilities: { create_sale: true, view_reports: true }, operators: team };
    await render(<CheckoutHomeScreen />);
    expect(mockEnabled.alerts).toBe(false);
    expect(screen.queryByText('Needs your attention')).toBeNull();
  });
});

describe('the queue and open sales', () => {
  it('says how clients get to an empty queue, then lists open sales with all sales a tap away', async () => {
    await render(<CheckoutHomeScreen />);
    expect(screen.getByText('Nobody waiting to pay')).toBeTruthy();
    expect(
      screen.getByText(
        'When a client arrives, or their appointment starts or finishes, they appear here. You can also check out any appointment from the calendar.',
      ),
    ).toBeTruthy();
    // No second row of tabs: open sales are a list with their count.
    expect(screen.queryByRole('tab', { name: 'Open sales' })).toBeNull();
    expect(screen.getByRole('header', { name: 'Open sales, 1' })).toBeTruthy();
    expect(screen.getByText('Sale 27 · Walk-in')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'All sales' }));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout/all-sales');
  });

  it('keeps the explanation above a queue that has people in it', async () => {
    mockQueue = [
      {
        booking_id: 'b1',
        booking_ids: ['b1'],
        group_booking_id: null,
        guest_id: 'g1',
        client_name: 'Jane Murphy',
        booking_date: '2026-10-11',
        start_time: '10:00:00',
        end_time: '10:45:00',
        status: 'started',
        services: [],
        price_pence: 3500,
        price_unknown: false,
        deposit_paid_pence: 1000,
        paid_pence: 1000,
        balance_due_pence: 2500,
        open_sale_id: null,
        open_sale_number_label: null,
      },
    ];
    await render(<CheckoutHomeScreen />);
    expect(screen.getByRole('header', { name: 'Ready to pay, 1' })).toBeTruthy();
    expect(screen.queryByText('Nobody waiting to pay')).toBeNull();
    expect(
      screen.getByText(
        'When a client arrives, or their appointment starts or finishes, they appear here. You can also check out any appointment from the calendar.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('£25.00 to pay')).toBeTruthy();
  });
});

describe('your sales and tips', () => {
  it("comes last for a team member, with its periods", async () => {
    mockBoot = { role: 'staff', capabilities: { create_sale: true }, operators: team };
    await render(<CheckoutHomeScreen />);
    expect(screen.getByText('Your sales and tips')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'This week' })).toBeTruthy();
    expect(screen.getByText('Sales credited to you: £120.00')).toBeTruthy();
    // After the queue, open sales and All sales.
    const order = screen.getAllByText(/^(Ready to pay|Open sales|Your sales and tips)$/).map((n) => n.props.children as string);
    expect(order).toEqual(['Ready to pay', 'Open sales', 'Your sales and tips']);
  });

  it("shows an admin today's own figures, without periods", async () => {
    await render(<CheckoutHomeScreen />);
    expect(screen.getByText('Your sales and tips today')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'This week' })).toBeNull();
    expect(mockMinePeriods.every((p) => p === 'today')).toBe(true);
  });

  it('gives a team member their commission so far, but not an admin, as on the web', async () => {
    mockMineCommission = { pence: 2897, can: true };
    mockBoot = { role: 'staff', capabilities: { create_sale: true }, operators: team };
    const staff = await render(<CheckoutHomeScreen />);
    expect(screen.getByText('Commission so far: £28.97')).toBeTruthy();
    staff.unmount();

    // An admin holds every capability, but the venue is who pays commission.
    mockBoot = { role: 'admin', capabilities: { create_sale: true, view_reports: true, see_own_commission: true }, operators: team };
    await render(<CheckoutHomeScreen />);
    expect(screen.getByText('Your sales and tips today')).toBeTruthy();
    expect(screen.queryByText('Commission so far: £28.97')).toBeNull();
  });

  it('is hidden in a one-person business, where the day is already theirs', async () => {
    mockBoot = { role: 'admin', capabilities: { create_sale: true, view_reports: true }, operators: [team[0]] };
    await render(<CheckoutHomeScreen />);
    expect(screen.queryByText('Your sales and tips today')).toBeNull();
    expect(screen.queryByText('Your sales and tips')).toBeNull();
    expect(mockMinePeriods).toEqual([]);
  });
});
