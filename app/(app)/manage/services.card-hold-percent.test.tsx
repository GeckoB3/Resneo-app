/**
 * A card hold's no-show fee as a percentage of the price (web card hold percentage plan,
 * 2026-11-25): the service form chooses Fixed amount or Percentage of the price, loads and saves
 * `card_hold_fee_percent`, shows a live example, and says an option's own fee is not used. The
 * service list names the fee "50% of the price".
 *
 * The screen's own hooks run against a fake `apiFetch`. jest hoists mock factories above imports,
 * so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), replace: jest.fn(), setParams: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
// Set up with AI is not opened here, and its image painter needs a native web view.
jest.mock('@/components/services-setup/ServicesSetupSheet', () => ({ ServicesSetupSheet: () => null }));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  hapticTap: jest.fn(),
  hapticSelect: jest.fn(),
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: { id: 'v-1', slug: 'bright', currency: 'GBP', current_user_role: 'admin', feature_flags: { resolved: {} } },
    isLoading: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockServicesResponse: unknown = null;
/** A write's answer, by test: return undefined for the default, or throw to refuse it. */
let mockWrite: (call: Call) => unknown = () => undefined;
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    const method = options.method ?? 'GET';
    const call = { path, method, body: options.body ? JSON.parse(options.body) : undefined };
    mockCalls.push(call);
    if (method === 'GET' && path === '/api/venue/appointment-services') return Promise.resolve(mockServicesResponse);
    if (method === 'GET' && path.startsWith('/api/venue/practitioners')) {
      return Promise.resolve({ practitioners: [{ id: 'cal-a', name: 'Amy', is_active: true, sort_order: 0 }] });
    }
    if (method === 'GET' && path.startsWith('/api/venue/addon-groups')) {
      return Promise.resolve({ groups: [], addons_by_group: {}, service_links: [] });
    }
    if (method === 'GET' && path === '/api/venue/staff/me') return Promise.resolve({ staff: { id: 'st-1', linked_calendar_ids: [] } });
    if (method === 'GET') return Promise.resolve(null);
    try {
      const answer = mockWrite(call);
      if (answer !== undefined) return Promise.resolve(answer);
    } catch (e) {
      return Promise.reject(e);
    }
    return Promise.resolve({ ok: true });
  },
}));

import { ApiError } from '@/lib/api/client';

import ServicesScreen from './services';

function service(over: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'Balayage',
    updated_at: '2026-11-20T10:00:00.000Z',
    duration_minutes: 120,
    buffer_minutes: 0,
    price_pence: 9000,
    deposit_pence: null,
    card_hold_fee_percent: 50,
    payment_requirement: 'card_hold',
    is_active: true,
    variants: [],
    addon_groups: [],
    ...over,
  };
}

function respondWith(...services: ReturnType<typeof service>[]) {
  mockServicesResponse = {
    services,
    practitioner_services: services.map((s) => ({ practitioner_id: 'cal-a', service_id: s.id })),
    categories: [],
  };
}

async function renderTheScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <ServicesScreen />
      </QueryClientProvider>,
    );
  });
}

async function openTheForm(name = 'Balayage') {
  await renderTheScreen();
  await act(async () => {
    fireEvent.press(await screen.findByText(name));
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
  });
}

async function save() {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  });
}

const patches = () => mockCalls.filter((c) => c.method === 'PATCH' && c.path.startsWith('/api/venue/appointment-services'));

beforeEach(() => {
  mockCalls.length = 0;
  mockWrite = () => undefined;
  respondWith(service());
});

describe('the service list', () => {
  it('names a percentage fee as a share of the price', async () => {
    await renderTheScreen();
    await act(async () => {
      fireEvent.press(await screen.findByText('Balayage'));
    });
    expect(screen.getByText('Card hold: no-show fee 50% of the price')).toBeTruthy();
  });

  it('keeps a fixed fee as an amount', async () => {
    respondWith(service({ card_hold_fee_percent: null, deposit_pence: 2000 }));
    await renderTheScreen();
    await act(async () => {
      fireEvent.press(await screen.findByText('Balayage'));
    });
    expect(screen.getByText('Card hold: £20.00 no-show fee')).toBeTruthy();
  });
});

describe('the service form', () => {
  it('loads a percentage fee with its live example, and saves it with no fixed fee', async () => {
    await openTheForm();
    expect(screen.getByRole('tab', { name: 'Percentage of the price', selected: true })).toBeTruthy();
    expect(screen.getByTestId('services-hold-fee-percent').props.value).toBe('50');
    expect(
      screen.getByText('Worked out from the price of the service, or the option chosen, plus any add-ons the client picks.'),
    ).toBeTruthy();
    expect(screen.getByText('On a £90.00 booking: £45.00')).toBeTruthy();
    // The fixed fee box is not shown in percentage mode.
    expect(screen.queryByLabelText('No-show fee (£)')).toBeNull();
    await save();
    const body = patches()[0]?.body as Record<string, unknown>;
    expect(body.payment_requirement).toBe('card_hold');
    expect(body.card_hold_fee_percent).toBe(50);
    expect(body.deposit_pence).toBeNull();
  });

  it('updates the example as the percent changes', async () => {
    await openTheForm();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('services-hold-fee-percent'), '25');
    });
    expect(screen.getByText('On a £90.00 booking: £22.50')).toBeTruthy();
  });

  it('switches a fixed fee to a percentage', async () => {
    respondWith(service({ card_hold_fee_percent: null, deposit_pence: 2000 }));
    await openTheForm();
    expect(screen.getByRole('tab', { name: 'Fixed amount', selected: true })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('tab', { name: 'Percentage of the price' }));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('services-hold-fee-percent'), '40');
    });
    await save();
    const body = patches()[0]?.body as Record<string, unknown>;
    expect(body.card_hold_fee_percent).toBe(40);
    expect(body.deposit_pence).toBeNull();
  });

  it('switches a percentage back to a fixed fee, which clears the percentage', async () => {
    await openTheForm();
    await act(async () => {
      fireEvent.press(screen.getByRole('tab', { name: 'Fixed amount' }));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('No-show fee (£)'), '15');
    });
    await save();
    const body = patches()[0]?.body as Record<string, unknown>;
    expect(body.card_hold_fee_percent).toBeNull();
    expect(body.deposit_pence).toBe(1500);
  });

  it('asks for a whole percentage from 1 to 100 before saving', async () => {
    await openTheForm();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('services-hold-fee-percent'), '120');
    });
    await save();
    expect(patches()).toHaveLength(0);
    expect(screen.getByText('Enter a no-show fee percentage from 1 to 100.')).toBeTruthy();
  });

  it("shows the server's message when the service has no price", async () => {
    const message = 'Set a price for this service, or its options, so the no-show fee can be worked out as a percentage.';
    mockWrite = (call) => {
      if (call.method === 'PATCH') throw new ApiError(message, 400, { error: message });
      return undefined;
    };
    await openTheForm();
    await save();
    expect(screen.getByText(message)).toBeTruthy();
  });

  it("does not send a percentage for a service that is not a card hold", async () => {
    respondWith(service({ payment_requirement: 'deposit', deposit_pence: 1000, card_hold_fee_percent: null }));
    await openTheForm();
    expect(screen.queryByRole('tab', { name: 'Percentage of the price' })).toBeNull();
    await save();
    const body = patches()[0]?.body as Record<string, unknown>;
    expect(body.card_hold_fee_percent).toBeNull();
    expect(body.deposit_pence).toBe(1000);
  });

  it("says an option's own fee is not used, and saves without checking it", async () => {
    respondWith(
      service({
        price_pence: 6000,
        variants: [
          {
            id: 'var-1',
            name: 'Short hair',
            description: null,
            duration_minutes: 90,
            buffer_minutes: 0,
            price_pence: 6000,
            // Under £1: refused as a fixed option fee, but not used with a percentage.
            deposit_pence: 50,
            sort_order: 0,
            is_active: true,
          },
        ],
      }),
    );
    await openTheForm();
    // The example uses the first offered option's price.
    expect(screen.getByText('On a £60.00 booking: £30.00')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Short hair'));
    });
    expect(screen.getByTestId('variant-fee-not-used-var-1')).toBeTruthy();
    expect(screen.getAllByText('Not used with a percentage fee').length).toBeGreaterThan(0);
    await save();
    const body = patches()[0]?.body as Record<string, unknown>;
    expect(body.card_hold_fee_percent).toBe(50);
    expect(body.deposit_pence).toBeNull();
  });
});
