/**
 * Settings, Commission in the app (web `CommissionCard`): the admin gate, the empty state where the
 * web leaves the card out, the basis saving at once (and its stale answer), the rows for everyone,
 * by category and per person, Change rate and the rate sheet (the rate check, the backdated warning,
 * the duplicate-date refusal word for word), Stop this rate, and Earlier rates newest first.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import type { CommissionRate, CommissionRatesResponse } from '@/lib/pos/settings-more/types';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
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
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useVenue', () => ({ useVenue: () => ({ data: { id: 'venue-1' }, isLoading: false }) }));
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

import CommissionSettingsScreen from './commission';

const STALE =
  "Someone else changed these settings while you were editing. We've loaded their changes. Check them, then save yours again.";
const DUPLICATE = 'There is already a rate for this starting on that date. Choose another date.';
const PATH = '/api/venue/pos/commission/rates';

let mockIsAdmin = true;
function settingsResponse() {
  return {
    settings: { trading_name: null, track_stock_enabled: false, version: 7 },
    staff_capability_map: {},
    can: { is_admin: mockIsAdmin, manage_settings: true, edit_capabilities: true },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
  };
}

function rate(over: Partial<CommissionRate>): CommissionRate {
  return {
    id: 'r',
    item_type: 'service',
    category_id: null,
    category_name: null,
    calendar_id: null,
    staff_id: null,
    person_name: null,
    rate_bps: 1000,
    effective_from: '2026-10-01',
    ...over,
  };
}

const CAL = '11111111-1111-4111-8111-111111111111';
const CAT = '22222222-2222-4222-8222-222222222222';

function rates(over: Partial<CommissionRatesResponse> = {}): CommissionRatesResponse {
  return {
    rates: [
      rate({ id: 'r1', rate_bps: 1000, effective_from: '2026-09-01' }),
      rate({ id: 'r2', rate_bps: 1500, effective_from: '2026-10-01' }),
      rate({ id: 'r3', calendar_id: CAL, person_name: 'Sam', rate_bps: 2000, effective_from: '2026-10-01' }),
    ],
    people: [
      { calendar_id: CAL, staff_id: null, name: 'Sam' },
      { calendar_id: null, staff_id: '33333333-3333-4333-8333-333333333333', name: 'Alex' },
    ],
    categories: [{ id: CAT, name: 'Colour', item_type: 'service' }],
    commission_basis: 'net_ex_vat',
    settings_version: 7,
    today: '2026-10-09',
    vat_registered: true,
    ...over,
  };
}

let current: unknown = rates();
let onWrite: (call: Call) => unknown = () => current;

beforeEach(() => {
  mockCalls.length = 0;
  mockToast.success.mockClear();
  mockIsAdmin = true;
  current = rates();
  onWrite = () => current;
  mockHandler = (call) => {
    if (call.path === '/api/venue/pos/settings') return settingsResponse();
    if (call.path === PATH && call.method === 'GET') return current;
    if (call.path === PATH) return onWrite(call);
    throw new Error(`unexpected ${call.method} ${call.path}`);
  };
});

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <CommissionSettingsScreen />
    </QueryClientProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
}

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

async function type(el: Parameters<typeof fireEvent.changeText>[0], text: string) {
  await act(async () => {
    fireEvent.changeText(el, text);
  });
}

const writes = () => mockCalls.filter((c) => c.method !== 'GET');

describe('the gates', () => {
  it('is for admins only', async () => {
    mockIsAdmin = false;
    await show();
    expect(await screen.findByText('For admins')).toBeTruthy();
    expect(mockCalls.some((c) => c.path === PATH)).toBe(false);
  });

  it('shows an empty state when the answer has no rates list', async () => {
    current = { ok: true };
    await show();
    expect(await screen.findByText("Commission isn't available yet")).toBeTruthy();
    expect(screen.queryByText('Work out commission on')).toBeNull();
  });

  it('shows an empty state when commission is switched off', async () => {
    mockHandler = (call) => {
      if (call.path === '/api/venue/pos/settings') return settingsResponse();
      throw new ApiError('Off', 403, { error: 'Off', code: 'feature_disabled' });
    };
    await show();
    expect(await screen.findByText("Commission isn't available yet")).toBeTruthy();
  });
});

describe('the rates', () => {
  it('shows the current rate per row, the placeholders and the empty line', async () => {
    await show();
    expect(await screen.findByText('15%, From 1 October 2026')).toBeTruthy();
    expect(screen.getByText('Products')).toBeTruthy();
    expect(screen.getAllByText('0%')).toHaveLength(1);
    expect(
      screen.getByText("0% · Usually 0%. What a voucher pays for earns commission when it's used, so a rate here would pay twice."),
    ).toBeTruthy();
    expect(screen.getByText('Sam: Services')).toBeTruthy();
    expect(screen.getByText('20%, From 1 October 2026')).toBeTruthy();
    expect(screen.queryByText('No rates yet. Add one for everyone to start.')).toBeNull();
    expect(screen.getByText(/The most specific rate wins/)).toBeTruthy();
  });

  it('says there are no rates yet', async () => {
    current = rates({ rates: [] });
    await show();
    expect(await screen.findByText('No rates yet. Add one for everyone to start.')).toBeTruthy();
  });

  it('shows earlier rates newest first', async () => {
    await show();
    await press(await screen.findByText('Earlier rates'));
    const lines = screen.getAllByText(/^1\d%, From /).map((n) => n.props.children);
    expect(lines).toEqual(['15%, From 1 October 2026', '15%, From 1 October 2026', '10%, From 1 September 2026']);
  });

  it("stops a person's own rate from today and keeps the answer", async () => {
    onWrite = (call) => {
      current = rates({
        rates: [...(current as CommissionRatesResponse).rates, rate({ id: 'r4', calendar_id: CAL, rate_bps: null, effective_from: '2026-10-09' })],
      });
      return { rate: {}, ...(current as CommissionRatesResponse), echoed: call.body };
    };
    await show();
    expect(await screen.findAllByText('Stop this rate')).toHaveLength(1);
    await press(screen.getByText('Stop this rate'));
    expect(writes()[0]).toEqual({
      path: PATH,
      method: 'POST',
      body: { item_type: 'service', category_id: null, calendar_id: CAL, staff_id: null, rate_percent: null, effective_from: '2026-10-09' },
    });
    expect(await screen.findByText('Stop this rate, From 9 October 2026')).toBeTruthy();
  });
});

describe('the basis', () => {
  it('saves at once with the settings version', async () => {
    onWrite = () => rates({ commission_basis: 'net_inc_vat', settings_version: 8 });
    await show();
    const settingsReads = () => mockCalls.filter((c) => c.path === '/api/venue/pos/settings').length;
    const before = settingsReads();
    await press(await screen.findByText('Prices including VAT'));
    expect(writes()[0]).toEqual({ path: PATH, method: 'PATCH', body: { version: 7, commission_basis: 'net_inc_vat' } });
    expect(mockToast.success).toHaveBeenCalledWith('Commission settings saved.');
    expect(settingsReads()).toBeGreaterThan(before);
  });

  it('a stale answer reloads and says so', async () => {
    onWrite = () => {
      throw new ApiError(STALE, 412, { error: STALE, code: 'POS_SETTINGS_STALE' });
    };
    await show();
    const gets = () => mockCalls.filter((c) => c.path === PATH && c.method === 'GET').length;
    await press(await screen.findByText('Prices including VAT'));
    expect(await screen.findByText(STALE)).toBeTruthy();
    expect(gets()).toBe(2);
  });
});

describe('the rate sheet', () => {
  it('changes the rate for everyone from a date', async () => {
    onWrite = () => {
      current = rates({ rates: [...(current as CommissionRatesResponse).rates, rate({ id: 'r5', item_type: 'product', rate_bps: 1250, effective_from: '2026-10-09' })] });
      return { rate: {}, ...(current as CommissionRatesResponse) };
    };
    await show();
    await screen.findByText('Products');
    const changes = screen.getAllByText('Change rate');
    await press(changes[1]!); // Products (placeholder)
    await press(screen.getAllByText('Save changes').at(-1)!);
    expect(screen.getByText('Enter a rate between 0% and 100%.')).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await type(screen.getByLabelText('Rate (%)'), '12,5');
    await press(screen.getAllByText('Save changes').at(-1)!);
    expect(writes()[0]!.body).toEqual({
      item_type: 'product',
      category_id: null,
      calendar_id: null,
      staff_id: null,
      rate_percent: 12.5,
      effective_from: '2026-10-09',
    });
    expect(mockToast.success).toHaveBeenCalledWith('Commission rate saved.');
    expect(await screen.findByText('12.5%, From 9 October 2026')).toBeTruthy();
  });

  it('warns about a start date before today', async () => {
    await show();
    await press((await screen.findAllByText('Change rate'))[0]!);
    await act(async () => {
      fireEvent(screen.getByLabelText('Starts on'), 'valueChange', {}, new Date(2026, 8, 20, 12));
    });
    expect(screen.getByText(/This starts before today, so it changes commission already worked out from 20 September 2026\./)).toBeTruthy();
  });

  it('shows the duplicate-date refusal word for word', async () => {
    onWrite = () => {
      throw new ApiError(DUPLICATE, 409, { error: DUPLICATE, code: 'CONFLICT', fields: [{ path: 'effective_from', message: DUPLICATE }] });
    };
    await show();
    await press((await screen.findAllByText('Change rate'))[0]!);
    await type(screen.getByLabelText('Rate (%)'), '15');
    await press(screen.getAllByText('Save changes').at(-1)!);
    expect(await screen.findByText(DUPLICATE)).toBeTruthy();
  });

  it("adds a person's rates with a category", async () => {
    await show();
    await press(await screen.findByText("Add a person's rates"));
    const save = () => screen.getAllByText('Save changes').at(-1)!;
    expect(screen.getByText('Choose a team member')).toBeTruthy();
    expect(screen.getByText('Any category')).toBeTruthy();
    await press(screen.getByText('Alex'));
    await press(screen.getByText('Colour'));
    await type(screen.getByLabelText('Rate (%)'), '30');
    await press(save());
    expect(writes()[0]!.body).toEqual({
      item_type: 'service',
      category_id: CAT,
      calendar_id: null,
      staff_id: '33333333-3333-4333-8333-333333333333',
      rate_percent: 30,
      effective_from: '2026-10-09',
    });
  });

  it('a category rate needs a category', async () => {
    await show();
    await press(await screen.findByText('Add a category rate'));
    expect(screen.getByText('Choose a category')).toBeTruthy();
    expect(screen.queryByText('Any category')).toBeNull();
    await type(screen.getByLabelText('Rate (%)'), '5');
    await press(screen.getAllByText('Save changes').at(-1)!);
    expect(writes()).toHaveLength(0);
    await press(screen.getByText('Colour'));
    await press(screen.getAllByText('Save changes').at(-1)!);
    expect(writes()[0]!.body).toMatchObject({ item_type: 'service', category_id: CAT, rate_percent: 5 });
  });
});
