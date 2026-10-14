/**
 * Commission splits in the app (web Settings, Commission splits tab; 2026-10-14), against the
 * contract's `/api/venue/commission/*` routes with Checkout on or off:
 *
 * - the admin gate, and no Checkout gate (a venue without Checkout counts completed bookings);
 * - Your team: what counts for services and the VAT basis saving at once on the settings version (a
 *   stale answer shows the server's sentence), the rates for everyone, by category and per person,
 *   Change rate and its sheet, Stop this rate, Earlier rates, and "Shown as" per person;
 * - Businesses you work with: what a split needs, the list and its statuses, opening a split, and
 *   "Propose a split" with its body, its checks, the worked example and the server's refusal.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import type { CommissionRate, CommissionSettingsResponse, SplitView, SplitsListResponse } from '@/types/commission-splits';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
}));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, { testID: 'sheet' }, children) : null,
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
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({ data: { id: 'venue-1', currency: 'GBP', timezone: 'Europe/London' }, isLoading: false }),
}));
let mockRole = 'admin';
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { role: mockRole } }, isLoading: false }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  isBackendConfigured: () => true,
}));

type Call = { path: string; method: string; body: Record<string, unknown> | undefined };
const mockCalls: Call[] = [];
let mockHandler: (call: Call) => unknown = () => ({});
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return {
    ...actual,
    apiFetch: (path: string, init: { method?: string; body?: string } = {}) => {
      const call = { path, method: init.method ?? 'GET', body: init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined };
      mockCalls.push(call);
      try {
        return Promise.resolve(mockHandler(call));
      } catch (e) {
        return Promise.reject(e);
      }
    },
  };
});

import CommissionSplitsScreen from './index';

const SETTINGS = '/api/venue/commission/settings';
const RATES = '/api/venue/commission/rates';
const SPLITS = '/api/venue/commission/splits';
const STALE =
  "Someone else changed these settings while you were editing. We've loaded their changes. Check them, then save yours again.";
const DUPLICATE = 'There is already a rate for this starting on that date. Choose another date.';
const CAL = '11111111-1111-4111-8111-111111111111';
const CAT = '22222222-2222-4222-8222-222222222222';
const ALEX = '33333333-3333-4333-8333-333333333333';

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
    created_by_name: null,
    created_at: '2026-10-01T09:00:00Z',
    ...over,
  };
}

function settings(over: Partial<CommissionSettingsResponse> = {}): CommissionSettingsResponse {
  return {
    rates: [
      rate({ id: 'r1', rate_bps: 1000, effective_from: '2026-09-01' }),
      rate({ id: 'r2', rate_bps: 1500, effective_from: '2026-10-01' }),
      rate({ id: 'r3', calendar_id: CAL, person_name: 'Sam', rate_bps: 2000, effective_from: '2026-10-01' }),
    ],
    people: [
      { calendar_id: CAL, staff_id: null, name: 'Sam', label: 'commission' },
      { calendar_id: null, staff_id: ALEX, name: 'Alex', label: 'their_share' },
    ],
    categories: [{ id: CAT, name: 'Colour', item_type: 'service' }],
    basis: { value: 'net_ex_vat', editable: true, vat_registered: true },
    source: { value: 'checkout', setting: 'auto', checkout_available: true },
    settings_version: 7,
    today: '2026-10-09',
    currency: 'GBP',
    ...over,
  };
}

function split(over: Partial<SplitView> = {}): SplitView {
  return {
    id: 's-1',
    status: 'active',
    label: 'rent',
    settlement_period: 'monthly',
    role: 'payee',
    payer: { venue_id: 'v-sam', name: 'Sam Cuts' },
    payee: { venue_id: 'venue-1', name: 'Bloom' },
    partner: { venue_id: 'v-sam', name: 'Sam Cuts' },
    calendar: { id: 'cal-sam', name: 'Sam' },
    proposed_by_you: true,
    created_at: '2026-10-01T09:00:00Z',
    terms: {
      id: 't-1',
      version: 1,
      effective_from: '2026-10-01',
      services_rate_bps: 4000,
      products_rate_bps: null,
      vat_basis: 'net_ex_vat',
      status: 'accepted',
      proposed_by_you: true,
      proposed_at: '2026-09-20T09:00:00Z',
      decided_at: '2026-09-21T09:00:00Z',
    },
    pending: null,
    history: [],
    ended_on: null,
    end_reason: null,
    ended_by_you: null,
    can: { respond: false, withdraw: false, propose_change: true, end: true },
    ...over,
  };
}

function list(over: Partial<SplitsListResponse> = {}): SplitsListResponse {
  return {
    today: '2026-10-14',
    currency: 'GBP',
    venue: { venue_id: 'venue-1', name: 'Bloom' },
    basis_default: 'net_ex_vat',
    splits: [],
    partners: [
      {
        venue_id: 'v-sam',
        name: 'Sam Cuts',
        access: 'link',
        their_calendars: [{ id: 'cal-sam', name: 'Sam' }],
        your_calendars: [{ id: 'cal-jo', name: 'Jo' }],
      },
    ],
    ...over,
  };
}

let currentSettings: unknown;
let currentList: unknown;
let onWrite: (call: Call) => unknown;

beforeEach(() => {
  mockCalls.length = 0;
  mockPush.mockClear();
  mockToast.success.mockClear();
  mockRole = 'admin';
  mockParams = {};
  currentSettings = settings();
  currentList = list();
  onWrite = () => currentSettings;
  mockHandler = (call) => {
    if (call.method !== 'GET') return onWrite(call);
    if (call.path === SETTINGS) return currentSettings;
    if (call.path === SPLITS) return currentList;
    if (call.path.startsWith('/api/venue/commission/splits/preview?')) {
      return {
        from: '2026-09-01',
        to: '2026-09-30',
        currency: 'GBP',
        services_pence: 90000,
        products_pence: 5000,
        services_owed_pence: 36000,
        products_owed_pence: 500,
        owed_pence: 36500,
        vat_note: true,
      };
    }
    throw new Error(`unexpected ${call.method} ${call.path}`);
  };
});

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <CommissionSplitsScreen />
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

async function openBusinesses() {
  await press(screen.getAllByText('Businesses you work with')[0]!);
  await screen.findByText(/Agree a share of one calendar/);
}

describe('the gates', () => {
  it('is for admins only', async () => {
    mockRole = 'staff';
    await show();
    expect(screen.getByText('For admins')).toBeTruthy();
    expect(screen.getByText('Only admins can manage commission splits.')).toBeTruthy();
    expect(mockCalls).toEqual([]);
  });

  it('works without Checkout: services count from completed bookings, and prices as booked', async () => {
    currentSettings = settings({
      basis: { value: 'net_ex_vat', editable: false, vat_registered: false },
      source: { value: 'bookings', setting: 'auto', checkout_available: false },
      settings_version: null,
    });
    await show();
    expect(
      await screen.findByText('Services count from completed bookings. Products and gift vouchers count once you sell them at Checkout.'),
    ).toBeTruthy();
    expect(screen.getByText("VAT isn't set up in ResNeo, so figures use prices as booked.")).toBeTruthy();
    expect(screen.queryByText('Automatic')).toBeNull();
    expect(screen.queryByText('Prices including VAT')).toBeNull();
    expect(mockCalls.every((c) => c.path.startsWith('/api/venue/commission/'))).toBe(true);
  });
});

describe('your team', () => {
  it('shows the current rate per row, the placeholders and the precedence', async () => {
    await show();
    expect(await screen.findByText('15%, From 1 October 2026')).toBeTruthy();
    expect(screen.getByText('Products')).toBeTruthy();
    expect(screen.getAllByText('0%')).toHaveLength(1);
    expect(screen.getByText('Sam: Services')).toBeTruthy();
    expect(screen.getByText('20%, From 1 October 2026')).toBeTruthy();
    expect(screen.getByText(/The most specific rate wins/)).toBeTruthy();
    expect(screen.getByText('Set the shares people and businesses earn from what your calendars take, and see what is owed. ResNeo works out the figures. Paying them is up to you.')).toBeTruthy();
  });

  it('says there are no rates yet', async () => {
    currentSettings = settings({ rates: [] });
    await show();
    expect(await screen.findByText('No rates yet. Add one for everyone to start.')).toBeTruthy();
  });

  it('shows earlier rates newest first', async () => {
    await show();
    await press(await screen.findByText('Earlier rates'));
    const lines = screen.getAllByText(/^1\d%, From /).map((n) => n.props.children);
    expect(lines).toEqual(['15%, From 1 October 2026', '15%, From 1 October 2026', '10%, From 1 September 2026']);
  });

  it("stops a person's own rate from today through the commission rates route", async () => {
    onWrite = () => {
      // The answer replaces the settings, and the read after every write sees the same.
      currentSettings = settings({ rates: [...settings().rates, rate({ id: 'r4', calendar_id: CAL, rate_bps: null, effective_from: '2026-10-09' })] });
      return { rate: {}, ...(currentSettings as CommissionSettingsResponse) };
    };
    await show();
    await press(await screen.findByText('Stop this rate'));
    expect(writes()[0]).toEqual({
      path: RATES,
      method: 'POST',
      body: { item_type: 'service', category_id: null, calendar_id: CAL, staff_id: null, rate_percent: null, effective_from: '2026-10-09' },
    });
    expect(await screen.findByText('Stop this rate, From 9 October 2026')).toBeTruthy();
  });

  it('saves what counts for services at once, with the settings version', async () => {
    onWrite = () => settings({ source: { value: 'bookings', setting: 'bookings', checkout_available: true }, settings_version: 8 });
    await show();
    await press(await screen.findByText('Completed bookings'));
    expect(writes()[0]).toEqual({ path: SETTINGS, method: 'PATCH', body: { version: 7, commission_source: 'bookings' } });
    expect(mockToast.success).toHaveBeenCalledWith('Saved. The report now counts services from completed bookings.');
  });

  it('saves the VAT basis at once', async () => {
    onWrite = () => settings({ basis: { value: 'net_inc_vat', editable: true, vat_registered: true }, settings_version: 8 });
    await show();
    await press(await screen.findByText('Prices including VAT'));
    expect(writes()[0]).toEqual({ path: SETTINGS, method: 'PATCH', body: { version: 7, commission_basis: 'net_inc_vat' } });
    expect(mockToast.success).toHaveBeenCalledWith('Commission settings saved.');
  });

  it('shows a stale answer word for word beside the fresh settings', async () => {
    onWrite = () => {
      throw new ApiError(STALE, 412, { error: STALE, code: 'STALE_RESOURCE', settings: settings({ settings_version: 9 }) });
    };
    await show();
    await press(await screen.findByText('Prices including VAT'));
    expect(await screen.findByText(STALE)).toBeTruthy();
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('changes how the report describes a person', async () => {
    onWrite = () => settings({ people: [{ calendar_id: CAL, staff_id: null, name: 'Sam', label: 'their_share' }, settings().people[1]!] });
    await show();
    await screen.findByText('People');
    // Sam's row comes first, then Alex's (already "Their share").
    await press(screen.getAllByText('Their share')[0]!);
    expect(writes()[0]).toEqual({ path: '/api/venue/commission/people', method: 'PUT', body: { person_key: `c:${CAL}`, label: 'their_share' } });
    expect(mockToast.success).toHaveBeenCalledWith('Saved.');
  });
});

describe('the rate sheet', () => {
  it('changes the rate for everyone from a date', async () => {
    onWrite = () => {
      currentSettings = settings({
        rates: [...settings().rates, rate({ id: 'r5', item_type: 'product', rate_bps: 1250, effective_from: '2026-10-09' })],
      });
      return { rate: {}, ...(currentSettings as CommissionSettingsResponse) };
    };
    await show();
    await screen.findByText('Products');
    await press(screen.getAllByText('Change rate')[1]!); // Products (placeholder)
    await press(screen.getAllByText('Save changes').at(-1)!);
    expect(screen.getByText('Enter a rate between 0% and 100%.')).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await type(screen.getByLabelText('Rate (%)'), '12,5');
    await press(screen.getAllByText('Save changes').at(-1)!);
    expect(writes()[0]).toEqual({
      path: RATES,
      method: 'POST',
      body: { item_type: 'product', category_id: null, calendar_id: null, staff_id: null, rate_percent: 12.5, effective_from: '2026-10-09' },
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
    const sheet = screen.getByTestId('sheet');
    expect(within(sheet).getByText('Choose a team member')).toBeTruthy();
    expect(within(sheet).getByText('Any category')).toBeTruthy();
    await press(within(sheet).getByText('Alex'));
    await press(within(sheet).getByText('Colour'));
    await type(within(sheet).getByLabelText('Rate (%)'), '30');
    await press(within(sheet).getByText('Save changes'));
    expect(writes()[0]!.body).toEqual({
      item_type: 'service',
      category_id: CAT,
      calendar_id: null,
      staff_id: ALEX,
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

describe('businesses you work with', () => {
  it('says what a split needs when there is no business to propose one to', async () => {
    currentList = list({ partners: [] });
    await show();
    await openBusinesses();
    expect(screen.getByText(/Splits need a link where the other business shares its calendar/)).toBeTruthy();
    expect(screen.getByText('No splits yet.')).toBeTruthy();
    expect(screen.queryByText('Propose a split')).toBeNull();
  });

  it('opens on the businesses from a notice, lists each split with its status, and opens one', async () => {
    mockParams = { section: 'businesses' };
    currentList = list({
      splits: [
        split(),
        split({
          id: 's-2',
          status: 'proposed',
          role: 'payer',
          label: 'fee',
          payer: { venue_id: 'venue-1', name: 'Bloom' },
          payee: { venue_id: 'v-sam', name: 'Sam Cuts' },
          calendar: { id: 'cal-jo', name: 'Jo' },
          proposed_by_you: false,
          terms: null,
          pending: { ...split().terms!, id: 't-9', status: 'proposed', proposed_by_you: false, effective_from: '2026-11-01' },
          can: { respond: true, withdraw: false, propose_change: false, end: false },
        }),
      ],
    });
    await show();
    expect(await screen.findByText('Sam at Sam Cuts')).toBeTruthy();
    expect(screen.getByText('Sam Cuts pays you · Rent')).toBeTruthy();
    expect(screen.getByText('40% of services from 1 October 2026 · Monthly')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Jo at Bloom')).toBeTruthy();
    expect(screen.getByText('You pay Sam Cuts · Fee')).toBeTruthy();
    expect(screen.getByText('Needs your answer')).toBeTruthy();
    await press(screen.getByLabelText('Jo at Bloom'));
    expect(mockPush).toHaveBeenCalledWith('/commission-splits/s-2');
  });

  it('proposes a split with every term, then opens it', async () => {
    onWrite = () => ({ split: split({ id: 's-new', status: 'proposed' }) });
    await show();
    await openBusinesses();
    await press(screen.getByText('Propose a split'));
    const sheet = screen.getByTestId('sheet');
    // One business: it is chosen; the calendar is not.
    expect(within(sheet).getByText('Choose a calendar')).toBeTruthy();
    expect(within(sheet).getByText('Their calendars (Sam Cuts pays you)')).toBeTruthy();
    expect(within(sheet).getByText('Your calendars (you pay Sam Cuts)')).toBeTruthy();
    await press(within(sheet).getByText('Sam'));
    await press(within(sheet).getByText('Fee'));
    await type(within(sheet).getByLabelText('Share of services (%)'), '40');
    await act(async () => {
      fireEvent(within(sheet).getByLabelText('Include products'), 'valueChange', true);
    });
    await type(within(sheet).getByLabelText('Share of products (%)'), '10');
    await press(within(sheet).getByText('Including VAT'));
    // Settle up starts at weekly, Monday to Sunday (web parity).
    await press(within(sheet).getByText('Send to Sam Cuts'));
    expect(writes()[0]).toEqual({
      path: SPLITS,
      method: 'POST',
      body: {
        calendar_id: 'cal-sam',
        other_venue_id: 'v-sam',
        label: 'fee',
        settlement_period: 'weekly',
        effective_from: '2026-10-14',
        services_rate_percent: 40,
        products_rate_percent: 10,
        vat_basis: 'net_inc_vat',
      },
    });
    expect(mockToast.success).toHaveBeenCalledWith('Sent. Sam Cuts needs to accept it before it counts.');
    expect(mockPush).toHaveBeenCalledWith('/commission-splits/s-new');
  });

  it('shows the worked example on last month, with the VAT note for the business that pays', async () => {
    await show();
    await openBusinesses();
    await press(screen.getByText('Propose a split'));
    const sheet = screen.getByTestId('sheet');
    await press(within(sheet).getByText('Jo'));
    await type(within(sheet).getByLabelText('Share of services (%)'), '40');
    expect(await within(sheet).findByText('Last month this would have come to £365.00.', {}, { timeout: 3000 })).toBeTruthy();
    expect(within(sheet).getByText('£900.00 of completed bookings.')).toBeTruthy();
    // Your calendar: your business pays, so the note names it.
    expect(within(sheet).getByText("VAT isn't set up in ResNeo for Bloom, so this uses prices as booked.")).toBeTruthy();
    const preview = mockCalls.find((c) => c.path.startsWith('/api/venue/commission/splits/preview?'));
    expect(preview?.path).toBe(
      '/api/venue/commission/splits/preview?calendar_id=cal-jo&other_venue_id=v-sam&services_rate_percent=40&vat_basis=net_ex_vat',
    );
  });

  it('checks the shares before sending, and says when it starts before today', async () => {
    await show();
    await openBusinesses();
    await press(screen.getByText('Propose a split'));
    const sheet = screen.getByTestId('sheet');
    await press(within(sheet).getByText('Sam'));
    await type(within(sheet).getByLabelText('Share of services (%)'), '120');
    await press(within(sheet).getByText('Send to Sam Cuts'));
    expect(within(sheet).getByText('Enter a percentage from 0 to 100.')).toBeTruthy();
    await type(within(sheet).getByLabelText('Share of services (%)'), '12.345');
    await press(within(sheet).getByText('Send to Sam Cuts'));
    expect(within(sheet).getByText('Use up to two decimal places.')).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await act(async () => {
      fireEvent(within(sheet).getByLabelText('Starts on'), 'valueChange', {}, new Date(2026, 9, 1, 12));
    });
    expect(within(sheet).getByText('This starts before today, so figures already in ResNeo will count once Sam Cuts agrees.')).toBeTruthy();
  });

  it("shows the server's refusal word for word, with the field it named beside its input", async () => {
    const NOT_ALLOWED =
      'You can only agree a split on a calendar at a business you have a "Work as one team" link with, or that shares a live collective with you.';
    onWrite = () => {
      throw new ApiError(NOT_ALLOWED, 400, {
        error: NOT_ALLOWED,
        code: 'VALIDATION_FAILED',
        fields: [{ path: 'effective_from', message: 'The start date must be before the split ends.' }],
      });
    };
    await show();
    await openBusinesses();
    await press(screen.getByText('Propose a split'));
    const sheet = screen.getByTestId('sheet');
    await press(within(sheet).getByText('Sam'));
    await type(within(sheet).getByLabelText('Share of services (%)'), '40');
    await press(within(sheet).getByText('Send to Sam Cuts'));
    await waitFor(() => expect(within(sheet).getByText(NOT_ALLOWED)).toBeTruthy());
    expect(within(sheet).getByText('The start date must be before the split ends.')).toBeTruthy();
    expect(mockToast.success).not.toHaveBeenCalled();
  });
});
