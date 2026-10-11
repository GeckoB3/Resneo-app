/**
 * The sale screen on a practice sale (POS test round 2026-10-11, Part 4, W11, OB4): the banner and
 * the five tips, products and the practice item only, every payment method shown and never sent,
 * the receipt preview, and "Finish practice" voiding with the reason "Practice".
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => mockRouter,
}));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'client', booking: 'appointment', staff: 'staff' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
// The sale's other sheets have their own tests; here they only need to open.
jest.mock('@/components/pos/SaleSheets', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    DiscountSheet: ({ visible }: { visible: boolean }) => (visible ? React.createElement(Text, null, 'discount-sheet') : null),
    ServingSheet: ({ visible }: { visible: boolean }) => (visible ? React.createElement(Text, null, 'serving-sheet') : null),
    LineEditorSheet: ({ line }: { line: { name: string } | null }) => (line ? React.createElement(Text, null, `line-editor ${line.name}`) : null),
  };
});
jest.mock('@/lib/queries/usePos', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePos')>('@/lib/queries/usePos'),
  usePosGate: () => ({ accessToken: 'token-A', enabled: true }),
  usePosCatalogue: () => ({
    data: { services: [{ id: 'svc-1', name: 'Cut and finish', options: [], calendars: [] }], favourites: [], products: [] },
    isLoading: false,
    isError: false,
  }),
  useProductSearch: () => ({
    data: {
      services: [],
      favourites: [],
      products: [
        {
          id: 'prod-1',
          name: 'Repair Shampoo',
          brand_name: null,
          restriction: 'none',
          options: [{ id: 'opt-1', name: '250 ml', price_pence: 1850, track_stock: false, available: 0 }],
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));
const mockPosFetch = jest.fn();
jest.mock('@/lib/pos/api', () => ({
  ...jest.requireActual<typeof import('@/lib/pos/api')>('@/lib/pos/api'),
  posFetch: (...args: unknown[]) => mockPosFetch(...args),
}));

import { PracticeSale } from '@/components/pos/practice/PracticeSale';
import { makeLine, makeSale } from '@/lib/pos/test-sale';
import { SaleStaleError } from '@/lib/queries/usePos';
import type { PosBootstrap, PosSale } from '@/types/pos';

function bootstrap(over: Partial<PosBootstrap['settings']> = {}): PosBootstrap {
  return {
    settings: { max_payment_pence: 1_000_000, staff_max_discount_percent: 15, ...over },
    capabilities: { take_payment: true, apply_discount: true, custom_line: true, edit_credit: true, void_open_sale: true },
    role: 'admin',
    tills: [],
    payment_types: [{ id: 'type-1', name: 'Bank transfer', requires_reference: false, is_active: true }],
    discount_presets: [],
    tip_settings: { tipping_enabled: false },
    operators: [{ kind: 'login', staff_id: 'staff-1', calendar_id: null, name: 'Sam' }],
    card_methods: { card_app: true, card_reader: true, pay_link: true },
    venue: { name: 'Bloom Hair Studio', currency: 'GBP', timezone: 'Europe/London' },
  };
}

function practice(over: Partial<PosSale> = {}): PosSale {
  return {
    ...makeSale({
      lines: [makeLine({ line_type: 'custom', name: 'Practice item', total_pence: 3000, unit_price_pence: 3000, list_unit_price_pence: 3000, seller: { staff_id: 'staff-1', calendar_id: null, name: 'Sam' } as never })],
      subtotal_pence: 3000,
      total_pence: 3000,
      balance_due_pence: 3000,
      ...over,
    }),
    practice: true,
  } as PosSale;
}

const mockFetch = jest.fn();
const realFetch = globalThis.fetch;

async function show(sale: PosSale, opts: { send?: jest.Mock; settings?: Partial<PosBootstrap['settings']> } = {}) {
  const send = opts.send ?? jest.fn().mockResolvedValue({ sale });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={client}>
      <PracticeSale sale={sale} bootstrap={bootstrap(opts.settings)} send={send} refreshing={false} onRefresh={jest.fn()} />
    </QueryClientProvider>,
  );
  return { send };
}

async function press(text: string | RegExp) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  mockRouter.replace.mockReset();
  mockRouter.push.mockReset();
  mockToast.success.mockReset();
  mockPosFetch.mockReset();
  mockPosFetch.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/venue/pos/receipt-preview')) {
      return { practice: true, html: '<p>Receipt</p>', text: 'Receipt\nBloom Hair Studio\nPractice item: £30.00\nTotal: £30.00' };
    }
    throw new Error(`unexpected call ${path}`);
  });
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('a practice sale', () => {
  it('says nothing is real, and walks through the five tips, which can be skipped', async () => {
    await show(practice());
    expect(screen.getByText('Practice sale. Nothing here is real, and no money moves.')).toBeTruthy();
    expect(screen.getByText('Tip 1 of 5')).toBeTruthy();
    expect(screen.getByText('This is the bill. When you check out a booking, everything the client had is already here.')).toBeTruthy();
    await press('Next');
    expect(screen.getByText('Tip 2 of 5')).toBeTruthy();
    expect(screen.getByText("Add a product, or anything else they're buying, here.")).toBeTruthy();
    await press('Next');
    // The discount tip names this venue's limit for the team.
    expect(screen.getByText('Give a discount here. Your team can take off up to 15%.')).toBeTruthy();
    await press('Skip the tips');
    expect(screen.queryByText(/^Tip \d of 5$/)).toBeNull();
  });

  it('keeps to products and the practice item: no client, services, vouchers, fees, park or void', async () => {
    const { send } = await show(practice({ lines: [], subtotal_pence: 0, total_pence: 0, balance_due_pence: 0 }));
    // The empty bill names what a practice takes, never a service or a fee.
    expect(screen.getByText('Add a product or the practice item to start.')).toBeTruthy();
    expect(screen.queryByText('Nothing on this sale yet. Add a service, an item or a fee.')).toBeNull();
    // Nobody is attached, and the client cannot be changed.
    expect(screen.getByText('Walk-in')).toBeTruthy();
    for (const absent of ['Park sale', 'Void sale', 'Combine with another sale', 'New sale', 'Refund', 'Send receipt']) {
      expect(screen.queryByText(absent)).toBeNull();
    }
    await press('Add items');
    expect(screen.getByText('Repair Shampoo')).toBeTruthy();
    expect(screen.getByText('Practice item')).toBeTruthy();
    for (const absent of ['Vouchers', 'Custom item', 'Add a fee', 'Favourites', 'Cut and finish']) {
      expect(screen.queryByText(absent)).toBeNull();
    }
    await press('Services');
    expect(
      screen.getByText('In a real checkout, the services from the booking come with it, so a practice sale leaves the diary alone.'),
    ).toBeTruthy();
    await press('Practice item');
    // The choice and the row share a name: the row is the one that carries the price.
    const row = screen.getByText('£30.00 · A pretend item to try things with');
    await act(async () => {
      fireEvent.press(row);
    });
    expect(send).toHaveBeenCalledWith({
      action: 'lines',
      body: {
        version: 3,
        ops: [
          {
            op: 'add',
            line: {
              kind: 'custom',
              name: 'Practice item',
              unit_price_pence: 3000,
              reporting_group: 'services',
              seller: { staff_id: 'staff-1', name: 'Sam' },
            },
          },
        ],
      },
    });
  });

  it('leaves the products out when "Sell products" is off', async () => {
    await show(practice(), { settings: { sell_products_enabled: false } as never });
    await press('Add items');
    expect(screen.queryByText('Repair Shampoo')).toBeNull();
    expect(screen.queryByText('Products')).toBeNull();
    expect(screen.getByText('£30.00 · A pretend item to try things with')).toBeTruthy();
  });

  it('shows what each way to pay would do, and never calls a payment route', async () => {
    const { send } = await show(practice());
    for (const [tile, sentence] of [
      ['Card', 'In a real sale, your client taps their card, phone or watch on this phone, and the sale finishes by itself.'],
      ['Card reader', 'In a real sale, the reader on your desk asks your client to tap or insert their card.'],
      ['Pay by link or QR code', 'Your client gets a link by text or email and pays on their own phone.'],
    ] as const) {
      await press('Take £30.00');
      await press(tile);
      // The outcome straight away (design B13): the method, what it would do, and "Paid".
      expect(screen.getByText(sentence)).toBeTruthy();
      expect(screen.getByText('Paid. This is the moment the receipt goes out.')).toBeTruthy();
      // "Finish practice" leads the outcome now, not the banner.
      expect(screen.getAllByText('Finish practice')).toHaveLength(1);
      await press('Choose another way to pay');
      expect(screen.queryByText('Paid. This is the moment the receipt goes out.')).toBeNull();
    }

    // The venue's own payment types, under "Other ways".
    await press('Take £30.00');
    await press('Other ways');
    await press('Bank transfer');
    expect(screen.getByText('Bank transfer')).toBeTruthy();
    expect(
      screen.getByText('For money taken outside ResNeo, like another card machine or a bank transfer. It shows in your takings under its own name.'),
    ).toBeTruthy();
    await press('Choose another way to pay');

    await press('Take £30.00');
    await press('Cash');
    expect(screen.getByText('Type what they gave you, and Checkout works out the change.')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Cash handed over'), '40');
    });
    expect(screen.getByText('Change to give: £10.00')).toBeTruthy();
    await press('Record £30.00 in cash');
    expect(screen.getByText('Paid. This is the moment the receipt goes out.')).toBeTruthy();
    expect(screen.getByText('Give £10.00 change')).toBeTruthy();
    // The receipt the outcome shows is read once it is on screen.
    expect(await screen.findByText(/Practice item: £30\.00/)).toBeTruthy();

    // Nothing was written to the sale and nothing reached a payment route.
    expect(send).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    const paths = mockPosFetch.mock.calls.map((c) => String(c[0]));
    expect(paths.every((p) => p.startsWith('/api/venue/pos/receipt-preview'))).toBe(true);
    expect(paths.some((p) => /payments|pay-links|reader|collect|complete/.test(p))).toBe(false);
  });

  it('shows the receipt the client would get, from the practice sale', async () => {
    await show(practice());
    await press('Take £30.00');
    await press('Card');
    expect(screen.getByText("This is what your client's receipt looks like.")).toBeTruthy();
    expect(await screen.findByText(/Practice item: £30\.00/)).toBeTruthy();
    expect(mockPosFetch).toHaveBeenCalledWith('/api/venue/pos/receipt-preview?sale_id=sale-1', { accessToken: 'token-A' });
    expect(screen.getByText('Practice')).toBeTruthy();
  });

  it('finishes by voiding with the reason "Practice", then goes back to set-up', async () => {
    const { send } = await show(practice());
    await act(async () => {
      fireEvent.press(screen.getAllByText('Finish practice')[0]!);
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ action: 'void', body: { version: 3, reason: 'Practice' } });
    expect(mockToast.success).toHaveBeenCalledWith("That's it. Your practice sale has been cleared away.");
    expect(mockRouter.replace).toHaveBeenCalledWith('/checkout-setup/done');
  });

  it('voids the fresh sale when it changed on another device', async () => {
    const fresh = practice({ version: 4 });
    const send = jest
      .fn()
      .mockRejectedValueOnce(new SaleStaleError('changed', fresh))
      .mockResolvedValue({ sale: { ...fresh, status: 'voided' } });
    await show(practice(), { send });
    await act(async () => {
      fireEvent.press(screen.getAllByText('Finish practice')[0]!);
    });
    expect(send).toHaveBeenLastCalledWith({ action: 'void', body: { version: 4, reason: 'Practice' } });
    expect(mockRouter.replace).toHaveBeenCalledWith('/checkout-setup/done');
  });

  it('goes back to set-up when the daily clean-up already cleared it away', async () => {
    const { ApiError } = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
    const send = jest
      .fn()
      .mockRejectedValue(new ApiError('This sale is no longer open.', 409, { error: 'This sale is no longer open.', code: 'POS_SALE_NOT_OPEN' }));
    await show(practice(), { send });
    await act(async () => {
      fireEvent.press(screen.getAllByText('Finish practice')[0]!);
    });
    expect(screen.queryByText('This sale is no longer open.')).toBeNull();
    expect(mockRouter.replace).toHaveBeenCalledWith('/checkout-setup/done');
  });

  it('says so and just goes back when the practice was already cleared away', async () => {
    const { send } = await show(practice({ status: 'voided', voided_at: '2026-10-11T12:00:00Z', void_reason: 'Practice' }));
    expect(screen.getByText("That's it. Your practice sale has been cleared away.")).toBeTruthy();
    expect(screen.queryByText('Add items')).toBeNull();
    expect(screen.queryByText(/^Take /)).toBeNull();
    expect(screen.queryByText('Finish practice')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Back to set-up'));
    });
    expect(send).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/checkout-setup/done');
  });

  it('offers Complete when a discount left nothing to pay, then the receipt', async () => {
    await show(practice({ discount_pence: 3000, total_pence: 0, balance_due_pence: 0 }));
    expect(screen.getByText('This is already paid in full. Add anything else, or press Complete to finish.')).toBeTruthy();
    await press('Complete');
    expect(screen.getByText('Paid. This is the moment the receipt goes out.')).toBeTruthy();
    expect(screen.getByText("This is what your client's receipt looks like.")).toBeTruthy();
    expect(await screen.findByText(/Practice item: £30\.00/)).toBeTruthy();
  });

  it('shows the error and stays when the void is refused', async () => {
    const send = jest.fn().mockRejectedValue(new Error('We couldn\'t save that. Please try again.'));
    await show(practice(), { send });
    await act(async () => {
      fireEvent.press(screen.getAllByText('Finish practice')[0]!);
    });
    expect(screen.getByText("We couldn't save that. Please try again.")).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
