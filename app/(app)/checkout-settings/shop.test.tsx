/**
 * Settings, Online shop in the app (web `ShopSettingsCard`, UX spec §9.12): who sees it, the
 * opening checklist and its "Fix this", the open switch (saved at once, closing asks first, the
 * server's refusal word for word), a save sending only what changed with the shared version, a 412
 * that loads the fresh settings and keeps the edits, policy templates, and delivery zones (the
 * starter zone, the zone sheet's own check and the server's area refusal).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
  useRouter: () => ({ push: mockPush }),
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
jest.mock('@/components/pos/settings-more/LinkShareCard', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LinkShareCard: (p: { url: string; copyLabel: string; qrLabel: string; openLabel: string }) =>
      React.createElement(Text, null, `${p.url} | ${p.openLabel} | ${p.copyLabel} | ${p.qrLabel}`),
  };
});
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
let mockShopOn = true;
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({
    data: { feature_flags: { resolved: { pos_enabled: true, pos_online_shop_enabled: mockShopOn } } },
  }),
}));
jest.mock('@/lib/queries/usePos', () => ({
  usePosEnabled: () => true,
  usePosGate: (extra = true) => ({ accessToken: 'token-A', enabled: extra }),
}));

type Call = { path: string; method: string; body: Record<string, unknown> | undefined };
const mockCalls: Call[] = [];
let mockHandler: (call: Call) => unknown = () => ({});
jest.mock('@/lib/pos/api', () => ({
  ...jest.requireActual<typeof import('@/lib/pos/api')>('@/lib/pos/api'),
  posFetch: (path: string, options: { method?: string; body?: Record<string, unknown> }) => {
    const call = { path, method: options.method ?? 'GET', body: options.body };
    mockCalls.push(call);
    try {
      return Promise.resolve(mockHandler(call));
    } catch (e) {
      return Promise.reject(e);
    }
  },
}));

import ShopSettingsScreen from './shop';

function posSettings(isAdmin = true) {
  return {
    settings: { trading_name: null, track_stock_enabled: false, version: 5 },
    staff_capability_map: {},
    can: { is_admin: isAdmin, manage_settings: isAdmin, edit_capabilities: isAdmin },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
  };
}

type View = {
  settings: Record<string, unknown>;
  zones: Record<string, unknown>[];
  readiness: { checks: Record<string, boolean>; canOpen: boolean; open: boolean; missing: string[] };
  missing_sentence: string;
  allowed_areas: string[];
  delivery_areas: string[];
  zone_presets: { highlands: string[] };
  shop_url: string | null;
  templates: Record<string, string>;
  policy_updated_at: string | null;
};

function shopView(over: { settings?: Record<string, unknown>; ready?: boolean; zones?: Record<string, unknown>[]; jurisdiction?: string } = {}): View {
  const ready = over.ready ?? false;
  return {
    settings: {
      shop_open: false,
      collection_enabled: true,
      collection_instructions: null,
      collection_ready_minutes: 120,
      collection_hold_days: 14,
      delivery_enabled: true,
      returns_policy: 'Returns text',
      cancellation_policy: null,
      delivery_policy: 'Delivery text',
      terms_of_sale: 'Terms text',
      policies_version: 2,
      shop_min_order_pence: 0,
      shop_stock_display: 'exact',
      return_window_days: 14,
      shop_return_postage: 'customer',
      shop_ready_sms_enabled: false,
      shop_delivered_email_enabled: true,
      jurisdiction: over.jurisdiction ?? 'gb',
      version: 5,
      ...over.settings,
    },
    zones: over.zones ?? [],
    readiness: {
      checks: { legal: false, policies: ready, cards: true, plan: true, products: ready, fulfilment: true },
      canOpen: ready,
      open: false,
      missing: ready ? [] : ['phone', 'cancellation'],
    },
    missing_sentence: ready ? '' : "a public phone number, your customers' right to cancel and a product sold online",
    allowed_areas: over.jurisdiction === 'ni' ? ['ni', 'gb'] : ['gb'],
    delivery_areas: over.jurisdiction === 'ie' ? [] : ['uk', 'ie', 'postcodes'],
    zone_presets: { highlands: ['HS', 'IV', 'ZE'] },
    shop_url: 'https://example.test/shop/studio',
    templates: { returns: 'Template returns', cancellation: 'Template cancellation', delivery: 'Template delivery', terms: 'Template terms' },
    policy_updated_at: '2026-10-01T10:00:00Z',
  };
}

let mockView: View = shopView();

function baseHandler() {
  return (call: Call) => {
    if (call.path === '/api/venue/pos/settings') return posSettings();
    if (call.path === '/api/venue/shop/settings' && call.method === 'GET') return mockView;
    return {};
  };
}

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <ShopSettingsScreen />
    </QueryClientProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
}

async function press(text: string | RegExp) {
  await fireEvent.press(screen.getByText(text));
}

beforeEach(() => {
  mockCalls.length = 0;
  mockShopOn = true;
  mockView = shopView();
  mockHandler = baseHandler();
  mockPush.mockClear();
  mockToast.success.mockClear();
});

describe('who sees it', () => {
  it('says the shop is switched off while the venue switch is off, and never loads it', async () => {
    mockShopOn = false;
    await show();
    expect(await screen.findByText('Online shop is switched off')).toBeTruthy();
    expect(mockCalls.some((c) => c.path === '/api/venue/shop/settings')).toBe(false);
  });

  it('is for admins only', async () => {
    mockHandler = (call) => (call.path === '/api/venue/pos/settings' ? posSettings(false) : mockView);
    await show();
    expect(await screen.findByText('For admins')).toBeTruthy();
    expect(mockCalls.some((c) => c.path === '/api/venue/shop/settings')).toBe(false);
  });
});

describe('the opening checklist', () => {
  it('ticks each line, says what is missing and keeps the switch off until it can open', async () => {
    await show();
    expect(await screen.findByText('Your shop is closed.')).toBeTruthy();
    expect(screen.getByTestId('shop-check-legal-todo')).toBeTruthy();
    expect(screen.getByTestId('shop-check-cards-done')).toBeTruthy();
    expect(screen.getAllByText('Fix this')).toHaveLength(3);
    expect(
      screen.getByText("Add these before you open your shop: a public phone number, your customers' right to cancel and a product sold online."),
    ).toBeTruthy();
    expect(screen.getByLabelText('Open my shop').props.disabled).toBe(true);
    expect(screen.getByText('Version 2, last changed 1 October 2026. Each order keeps the version its customer agreed to.')).toBeTruthy();
    expect(
      screen.getByText(
        "Add a zone for each place you deliver to, each with its own price. If an address is in a postcode zone and the whole-UK zone, the postcode zone's price is used.",
      ),
    ).toBeTruthy();
  });

  it('opens Checkout settings for business details and Products for products', async () => {
    await show();
    await screen.findByText('Your shop is closed.');
    await fireEvent.press(screen.getByLabelText(/^Fix this: Business details complete/));
    expect(mockPush).toHaveBeenCalledWith('/checkout-settings');
    await fireEvent.press(screen.getByLabelText('Fix this: At least one product set to sell online'));
    expect(mockPush).toHaveBeenCalledWith('/stock');
  });
});

describe('the open switch', () => {
  it('opens the shop at once and shows the server refusal word for word', async () => {
    mockView = shopView({ ready: true });
    await show();
    await screen.findByText('Your shop is closed.');
    const refusal = 'Add these before you open your shop: a public phone number.';
    mockHandler = (call) => {
      if (call.method === 'PATCH') throw new ApiError(refusal, 409, { error: refusal, code: 'SHOP_LEGAL_DETAILS_MISSING' });
      return baseHandler()(call);
    };
    await fireEvent(screen.getByLabelText('Open my shop'), 'valueChange', true);
    const patch = mockCalls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ shop_open: true, version: 5 });
    expect(screen.getByText(refusal)).toBeTruthy();
  });

  it('asks before closing, then saves shop_open false; the link shows while open', async () => {
    mockView = shopView({ ready: true, settings: { shop_open: true } });
    await show();
    expect(await screen.findByText('Your shop is open.')).toBeTruthy();
    expect(screen.getByText('https://example.test/shop/studio | View your shop | Copy shop link | Download QR code')).toBeTruthy();
    mockHandler = (call) => {
      if (call.method === 'PATCH') return shopView({ ready: true, settings: { shop_open: false, version: 6 } });
      return baseHandler()(call);
    };
    await fireEvent(screen.getByLabelText('Open my shop'), 'valueChange', false);
    expect(mockCalls.some((c) => c.method === 'PATCH')).toBe(false);
    expect(screen.getByText("Customers can't place new orders. Orders already placed carry on as normal.")).toBeTruthy();
    await press('Close shop');
    expect(mockCalls.find((c) => c.method === 'PATCH')?.body).toEqual({ shop_open: false, version: 5 });
    expect(await screen.findByText('Your shop is closed.')).toBeTruthy();
    expect(mockToast.success).toHaveBeenCalledWith('Shop settings saved.');
    // The shop shares the POS settings version, so the POS settings are read again.
    expect(mockCalls.filter((c) => c.path === '/api/venue/pos/settings' && c.method === 'GET').length).toBeGreaterThanOrEqual(2);
  });
});

describe('saving', () => {
  it('sends only what changed, with the shared settings version', async () => {
    await show();
    await screen.findByText('Your shop is closed.');
    await fireEvent.changeText(screen.getByLabelText('Customers can ask for a return for (days)'), '30');
    await press("Don't show stock");
    await fireEvent(screen.getByLabelText('Also text customers when their order is ready to collect'), 'valueChange', true);
    mockHandler = (call) => {
      if (call.method === 'PATCH') return shopView({ settings: { return_window_days: 30, shop_stock_display: 'none', shop_ready_sms_enabled: true, version: 6 } });
      return baseHandler()(call);
    };
    await press('Save changes');
    expect(mockCalls.find((c) => c.method === 'PATCH')?.body).toEqual({
      return_window_days: 30,
      shop_stock_display: 'none',
      shop_ready_sms_enabled: true,
      version: 5,
    });
    expect(mockToast.success).toHaveBeenCalledWith('Shop settings saved.');
    expect(screen.queryByText('Save changes')).toBeNull();
  });

  it('fills a policy from the template', async () => {
    await show();
    await screen.findByText('Your shop is closed.');
    await fireEvent.press(screen.getAllByText('Use our template')[1]!);
    expect(screen.getByLabelText("Your customers' right to cancel").props.value).toBe('Template cancellation');
    mockHandler = (call) => (call.method === 'PATCH' ? shopView({ settings: { version: 6 } }) : baseHandler()(call));
    await press('Save changes');
    expect(mockCalls.find((c) => c.method === 'PATCH')?.body).toEqual({ cancellation_policy: 'Template cancellation', version: 5 });
  });

  it('on a 412 loads the fresh settings, keeps the edits and saves again at the new version', async () => {
    await show();
    await screen.findByText('Your shop is closed.');
    await fireEvent.changeText(screen.getByLabelText('Keep orders for (days)'), '21');
    const stale = "Someone else changed these settings while you were editing. We've loaded their changes. Check them, then save yours again.";
    const fresh = shopView({ settings: { version: 7, shop_stock_display: 'low_only' } });
    mockHandler = (call) => {
      if (call.method === 'PATCH') throw new ApiError(stale, 412, { error: stale, code: 'POS_SETTINGS_STALE', ...fresh });
      return baseHandler()(call);
    };
    await press('Save changes');
    expect(screen.getByText(stale)).toBeTruthy();
    expect(screen.getByLabelText('Keep orders for (days)').props.value).toBe('21');
    expect(screen.getByText('Use their changes')).toBeTruthy();
    expect(screen.getByLabelText('Only say when stock is low').props.accessibilityState.selected).toBe(true);
    mockHandler = (call) => (call.method === 'PATCH' ? shopView({ settings: { version: 8, collection_hold_days: 21 } }) : baseHandler()(call));
    await press('Save changes');
    const patches = mockCalls.filter((c) => c.method === 'PATCH');
    expect(patches[1]?.body).toEqual({ collection_hold_days: 21, version: 7 });
  });

  it('shows a field refusal word for word', async () => {
    await show();
    await screen.findByText('Your shop is closed.');
    await fireEvent.changeText(screen.getByLabelText('Customers can ask for a return for (days)'), '7');
    mockHandler = (call) => {
      if (call.method === 'PATCH') {
        throw new ApiError('Some details need checking.', 400, {
          error: 'Some details need checking.',
          fields: [{ path: 'return_window_days', message: 'The law gives customers at least 14 days.' }],
        });
      }
      return baseHandler()(call);
    };
    await press('Save changes');
    expect(screen.getByText('Some details need checking.')).toBeTruthy();
    expect(screen.getByText('The law gives customers at least 14 days.')).toBeTruthy();
  });
});

describe('delivery zones', () => {
  it('lists zones with their area, price, free-over and time, and Not offered', async () => {
    mockView = shopView({
      zones: [
        { id: 'z1', name: 'Mainland', area: 'uk', price_pence: 395, free_over_pence: 5000, estimate_text: null, is_active: true, version: 1 },
        { id: 'z2', name: 'Islands', area: 'postcodes', include_postcode_prefixes: ['HS', 'IV'], price_pence: 900, free_over_pence: null, estimate_text: '5 days', is_active: false, version: 1 },
        { id: 'z3', name: 'Ireland', area: 'ie', price_pence: 995, free_over_pence: null, estimate_text: null, is_active: true, version: 1 },
      ],
    });
    await show();
    expect(
      await screen.findByText('The whole UK · £3.95 · Free delivery on orders over £50.00. Below that, delivery costs £3.95. · Delivered within 30 days'),
    ).toBeTruthy();
    expect(screen.getByText('Postcodes HS, IV · £9.00 · 5 days')).toBeTruthy();
    expect(screen.getByText('Republic of Ireland · £9.95 · Delivered within 30 days')).toBeTruthy();
    expect(screen.getByText('Not offered')).toBeTruthy();
    expect(screen.queryByText('Add a zone for the whole of the UK')).toBeNull();
  });

  it('adds the starter zone for the whole UK', async () => {
    await show();
    expect(await screen.findByText('No delivery zones yet.')).toBeTruthy();
    await press('Add a zone for the whole of the UK');
    const post = mockCalls.find((c) => c.method === 'POST');
    expect(post?.path).toBe('/api/venue/shop/delivery-zones');
    expect(post?.body).toMatchObject({ name: 'Standard delivery', area: 'uk', price_pence: 395 });
    expect(typeof post?.body?.client_request_id).toBe('string');
  });

  it('checks the zone sheet and its postcodes, then shows the server refusal word for word', async () => {
    mockView = shopView({ jurisdiction: 'ni' });
    await show();
    await screen.findByText('No delivery zones yet.');
    await press('Add a delivery zone');
    await press('Save zone');
    expect(screen.getByText('Add a name and a price.')).toBeTruthy();
    expect(mockCalls.some((c) => c.method === 'POST')).toBe(false);

    await fireEvent.changeText(screen.getByLabelText('Name customers see'), 'Local');
    await fireEvent.changeText(screen.getByLabelText('Price'), '4.50');
    await press('Local delivery (postcodes you choose)');
    await press('Save zone');
    expect(screen.getByText('Add at least one postcode area or district.')).toBeTruthy();
    expect(mockCalls.some((c) => c.method === 'POST')).toBe(false);
    await fireEvent.changeText(screen.getByLabelText('Postcodes it covers'), 'LS6, LS7');
    const refusal = "These aren't postcode areas or districts: LS7x. Use the first part of a postcode, like LS6.";
    mockHandler = (call) => {
      if (call.method === 'POST') throw new ApiError(refusal, 400, { error: refusal, code: 'VALIDATION_FAILED' });
      return baseHandler()(call);
    };
    await press('Save zone');
    const post = mockCalls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({
      name: 'Local',
      area: 'postcodes',
      postcodes: ['LS6', 'LS7'],
      price_pence: 450,
      free_over_pence: null,
      estimate_text: null,
      is_active: true,
    });
    expect(screen.getByText(refusal)).toBeTruthy();
    // Northern Ireland parcels to Ireland need no customs, so no customs note there.
    await press('Republic of Ireland');
    expect(screen.queryByText(/customs form/)).toBeNull();
  });

  it('starts a Highlands and islands zone from the list, and warns about customs for Ireland', async () => {
    await show();
    await screen.findByText('No delivery zones yet.');
    await press('Add a delivery zone');
    await press('Highlands and islands');
    expect(screen.getByLabelText('Name customers see').props.value).toBe('Highlands and islands');
    expect(screen.getByLabelText('Postcodes it covers').props.value).toBe('HS, IV, ZE');
    await fireEvent.changeText(screen.getByLabelText('Price'), '12.95');
    mockHandler = (call) => (call.method === 'POST' ? { zone: {} } : baseHandler()(call));
    await press('Save zone');
    expect(mockCalls.find((c) => c.method === 'POST')?.body).toMatchObject({
      name: 'Highlands and islands',
      area: 'postcodes',
      postcodes: ['HS', 'IV', 'ZE'],
      price_pence: 1295,
    });

    await press('Add a delivery zone');
    await press('Republic of Ireland');
    expect(screen.getByLabelText('Name customers see').props.value).toBe('Republic of Ireland');
    expect(
      screen.getByText(
        'Parcels to the Republic of Ireland need a customs form, and your customer may have to pay import VAT or fees when it arrives. Check with your carrier and your accountant before you offer it.',
      ),
    ).toBeTruthy();
  });

  it('edits a zone with its version', async () => {
    mockView = shopView({
      zones: [{ id: 'z1', name: 'Mainland', area: 'uk', price_pence: 395, free_over_pence: null, estimate_text: null, is_active: true, version: 3 }],
    });
    await show();
    await screen.findByText('Mainland');
    await fireEvent.press(screen.getByLabelText('Edit Mainland'));
    expect(screen.getByText('Where it delivers')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Offer this zone'), 'valueChange', false);
    mockHandler = (call) => (call.method === 'PATCH' ? { zone: {} } : baseHandler()(call));
    await press('Save zone');
    expect(mockCalls.find((c) => c.method === 'PATCH')?.body).toEqual({
      name: 'Mainland',
      area: 'uk',
      price_pence: 395,
      free_over_pence: null,
      estimate_text: null,
      is_active: false,
      id: 'z1',
      version: 3,
    });
    expect(screen.queryByText('Save zone')).toBeNull();
  });
});
