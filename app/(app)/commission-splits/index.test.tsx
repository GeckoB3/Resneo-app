/**
 * Commission splits in the app, calendar first (web Settings, Commission splits and its page test,
 * 2026-10-14), against the contract's `/api/venue/commission/*` routes with Checkout on or off:
 *
 * - the admin gate, and no Checkout gate (a venue without Checkout counts completed bookings);
 * - each of your calendars in words (own or standard rates, the categories that differ), calendars
 *   at businesses you work with grouped by business, logins without a calendar where Checkout is set
 *   up, what links make possible when there are none, and past splits out of the way;
 * - waiting for your answer, at the top: Accept and Decline with the web's sentences;
 * - "Set up a split" in one sheet: whose takings, who earns a share, then a person's share (saved in
 *   one step) or a proposal (with its sentence and worked example), and Back; a pairing that already
 *   has a split; "Share with a business";
 * - changing a share, a share for someone paid nothing, a category rate, the server's sentences;
 * - Standard rates and How figures are worked out, as the old team panel did them.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import type { CommissionRate, CommissionSettingsResponse, SplitTermsView, SplitView, SplitsListResponse } from '@/types/commission-splits';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
const mockOpenBrowser = jest.fn((_url: string) => Promise.resolve({ type: 'opened' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (url: string) => mockOpenBrowser(url) }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
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
  useVenue: () => ({ data: { id: 'v-me', currency: 'GBP', timezone: 'Europe/London' }, isLoading: false }),
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
const SHARE = '/api/venue/commission/share';
const SPLITS = '/api/venue/commission/splits';
const STALE =
  "Someone else changed these settings while you were editing. We've loaded their changes. Check them, then save yours again.";

const ME = { venue_id: 'v-me', name: 'Bloom Hair' };
const SAM = { venue_id: 'v-sam', name: 'Sam Cuts' };
const NAIL = { venue_id: 'v-nail', name: 'Nail Studio' };

let nextId = 0;
function rate(over: Partial<CommissionRate>): CommissionRate {
  nextId += 1;
  return {
    id: `r-${nextId}`,
    item_type: 'service',
    category_id: null,
    category_name: null,
    calendar_id: null,
    staff_id: null,
    person_name: null,
    rate_bps: 500,
    effective_from: '2026-01-01',
    created_by_name: null,
    created_at: '2026-01-01T09:00:00Z',
    ...over,
  };
}

const BASE_RATES: CommissionRate[] = [
  rate({ id: 'r-service', rate_bps: 500 }),
  rate({ id: 'r-product', item_type: 'product', rate_bps: 2000 }),
  rate({ id: 'r-jess', calendar_id: 'cal-jess', rate_bps: 4000, effective_from: '2026-09-01' }),
  rate({ id: 'r-jess-colour', calendar_id: 'cal-jess', category_id: 'colour', category_name: 'Colour', rate_bps: 5000, effective_from: '2026-09-01' }),
];

function settings(over: Partial<CommissionSettingsResponse> = {}): CommissionSettingsResponse {
  return {
    rates: BASE_RATES,
    people: [
      { calendar_id: 'cal-jess', staff_id: null, name: 'Jess', label: 'commission' },
      { calendar_id: 'cal-kim', staff_id: null, name: 'Kim', label: 'their_share' },
      { calendar_id: null, staff_id: 'staff-desk', name: 'Front desk', label: 'commission' },
    ],
    categories: [{ id: 'colour', name: 'Colour', item_type: 'service' }],
    basis: { value: 'net_ex_vat', editable: true, vat_registered: true },
    source: { value: 'checkout', setting: 'auto', checkout_available: true },
    settings_version: 3,
    today: '2026-10-14',
    currency: 'GBP',
    ...over,
  };
}

function terms(over: Partial<SplitTermsView> = {}): SplitTermsView {
  return {
    id: 't1',
    version: 1,
    effective_from: '2026-09-01',
    services_rate_bps: 4000,
    products_rate_bps: null,
    vat_basis: 'net_ex_vat',
    status: 'accepted',
    proposed_by_you: true,
    proposed_at: '2026-08-20T10:00:00Z',
    decided_at: '2026-08-21T10:00:00Z',
    ...over,
  };
}

const NO_ACTIONS = { respond: false, withdraw: false, propose_change: false, end: false };

/** Sam Cuts pays you rent on Sam's calendar. */
function samSplit(over: Partial<SplitView> = {}): SplitView {
  const t = terms();
  return {
    id: 's-sam',
    status: 'active',
    label: 'rent',
    settlement_period: 'weekly',
    role: 'payee',
    payer: SAM,
    payee: ME,
    partner: SAM,
    calendar: { id: 'cal-sam', name: 'Sam' },
    proposed_by_you: true,
    created_at: '2026-08-20T10:00:00Z',
    terms: t,
    pending: null,
    history: [t],
    ended_on: null,
    end_reason: null,
    ended_by_you: null,
    can: { ...NO_ACTIONS, propose_change: true, end: true },
    ...over,
  };
}

/** Sam Cuts proposed that you pay them a fee on Jess's calendar: it needs your answer. */
function jessProposal(): SplitView {
  const pending = terms({ id: 't-jess', services_rate_bps: 1000, status: 'proposed', proposed_by_you: false, decided_at: null, effective_from: '2026-11-02' });
  return {
    ...samSplit(),
    id: 's-jess',
    status: 'proposed',
    label: 'fee',
    role: 'payer',
    payer: ME,
    payee: SAM,
    calendar: { id: 'cal-jess', name: 'Jess' },
    proposed_by_you: false,
    terms: null,
    pending,
    history: [pending],
    can: { ...NO_ACTIONS, respond: true },
  };
}

function list(over: Partial<SplitsListResponse> = {}): SplitsListResponse {
  return {
    today: '2026-10-14',
    currency: 'GBP',
    venue: ME,
    basis_default: 'net_ex_vat',
    splits: [samSplit()],
    partners: [
      { ...SAM, access: 'link', their_calendars: [{ id: 'cal-sam', name: 'Sam' }], your_calendars: [{ id: 'cal-jess', name: 'Jess' }] },
      { ...NAIL, access: 'collective', their_calendars: [{ id: 'cal-nina', name: 'Nina' }], your_calendars: [] },
    ],
    ...over,
  };
}

let currentSettings: CommissionSettingsResponse;
let currentList: SplitsListResponse;
let onWrite: (call: Call) => unknown;

beforeEach(() => {
  mockCalls.length = 0;
  mockPush.mockClear();
  mockToast.success.mockClear();
  mockRole = 'admin';
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
        services_pence: 20000,
        products_pence: 0,
        services_owed_pence: 7000,
        products_owed_pence: 0,
        owed_pence: 7000,
        vat_note: false,
      };
    }
    throw new Error(`unexpected ${call.method} ${call.path}`);
  };
});

/** A tick for the query client's batched notifications, so every update lands inside `act`. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <CommissionSplitsScreen />
    </QueryClientProvider>,
  );
  // Both reads answer at once here; let them land inside `act`.
  await act(async () => {
    await settle();
    await settle();
  });
  await screen.findByText('Your calendars');
}

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
    await settle();
  });
}

async function type(el: Parameters<typeof fireEvent.changeText>[0], text: string) {
  await act(async () => {
    fireEvent.changeText(el, text);
    await settle();
  });
}

const writes = () => mockCalls.filter((c) => c.method !== 'GET');
const section = (id: string) => screen.getByTestId(id);
const sheet = () => screen.getByTestId('sheet');

/** "Set up a split" at the top of the screen (calendars at other businesses have their own). */
async function openSetUp() {
  await press(screen.getByLabelText('Set up a split'));
  return sheet();
}

describe('the gates', () => {
  it('is for admins only', async () => {
    mockRole = 'staff';
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <CommissionSplitsScreen />
      </QueryClientProvider>,
    );
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
      screen.getByText('Services count from completed bookings. Products and gift vouchers count once you sell them at Checkout.'),
    ).toBeTruthy();
    expect(screen.getByText("VAT isn't set up in ResNeo, so figures use prices as booked.")).toBeTruthy();
    expect(screen.queryByText('Automatic')).toBeNull();
    expect(screen.queryByText('Prices including VAT')).toBeNull();
    expect(mockCalls.every((c) => c.path.startsWith('/api/venue/commission/'))).toBe(true);
  });
});

describe('what the screen says', () => {
  it('describes each of your calendars in words, with its own rates or your standard rates', async () => {
    await show();
    expect(
      screen.getByText('Decide who earns a share of what each calendar takes. ResNeo works out what is owed. Paying it is up to you.'),
    ).toBeTruthy();
    const yours = section('calendars');
    expect(within(yours).getByText('You pay Jess 40% of services and 20% of products, as commission.')).toBeTruthy();
    expect(within(yours).getByText('Own rates')).toBeTruthy();
    expect(within(yours).getByText('Different for Colour (50%).')).toBeTruthy();
    expect(within(yours).getByText('You pay Kim 5% of services and 20% of products, as their share.')).toBeTruthy();
    expect(within(yours).getByText('Standard rates')).toBeTruthy();
    // A login is not a calendar: it has its own section.
    expect(within(yours).queryByText(/Front desk/)).toBeNull();
    // Sam Cuts can see Jess's calendar and has no split on it yet.
    expect(within(yours).getAllByText('Share with a business')).toHaveLength(1);
  });

  it('says when someone earns only on some categories, and when someone earns nothing', async () => {
    currentSettings = settings({
      rates: [rate({ calendar_id: 'cal-jess', category_id: 'colour', category_name: 'Colour', rate_bps: 1000 })],
    });
    await show();
    const yours = section('calendars');
    expect(within(yours).getByText('You pay Jess only on some categories, as commission.')).toBeTruthy();
    expect(within(yours).getByText('Different for Colour (10%).')).toBeTruthy();
    expect(within(yours).getByText("You don't pay Kim a share yet.")).toBeTruthy();
    expect(within(yours).getByLabelText("Set a share: Kim's share")).toBeTruthy();
    expect(within(yours).getByLabelText("Change: Jess's share")).toBeTruthy();
  });

  it('groups calendars at businesses you work with by business, with their splits', async () => {
    await show();
    const theirs = section('partners');
    expect(within(theirs).getByText('Calendars at businesses you work with')).toBeTruthy();
    expect(within(theirs).getByText('Sam Cuts')).toBeTruthy();
    expect(within(theirs).getByText('"Work as one team" link')).toBeTruthy();
    expect(within(theirs).getByText('Sam Cuts pays you 40% of services, as rent.')).toBeTruthy();
    expect(within(theirs).getByText('Active')).toBeTruthy();
    expect(within(theirs).getByText('Nail Studio')).toBeTruthy();
    expect(within(theirs).getByText('Your collective')).toBeTruthy();
    expect(within(theirs).getByText('Nina')).toBeTruthy();
    expect(within(theirs).getByText('No split yet.')).toBeTruthy();
  });

  it('explains logins without a calendar where Checkout is set up', async () => {
    await show();
    const logins = section('logins');
    expect(within(logins).getByText(/only earn from what they sell at Checkout/)).toBeTruthy();
    expect(within(logins).getByText('You pay Front desk 5% of services and 20% of products, as commission.')).toBeTruthy();
    expect(within(logins).getByLabelText("Change: Front desk's share")).toBeTruthy();
  });

  it('leaves logins out without Checkout', async () => {
    currentSettings = settings({ source: { value: 'bookings', setting: 'auto', checkout_available: false } });
    await show();
    expect(screen.queryByTestId('logins')).toBeNull();
  });

  it("keeps a login's own rate in view without Checkout", async () => {
    currentSettings = settings({
      rates: [...BASE_RATES, rate({ staff_id: 'staff-desk', item_type: 'product', rate_bps: 300 })],
      source: { value: 'bookings', setting: 'auto', checkout_available: false },
    });
    await show();
    expect(within(section('logins')).getByText('You pay Front desk 5% of services and 3% of products, as commission.')).toBeTruthy();
  });

  it('says what links and collectives make possible when there are none', async () => {
    currentList = list({ partners: [], splits: [] });
    await show();
    const theirs = section('partners');
    expect(within(theirs).getByText(/When you link with another business/)).toBeTruthy();
    await press(within(theirs).getByText('Go to Linked venues'));
    expect(mockPush).toHaveBeenCalledWith('/linked-venues');
    expect(within(section('calendars')).queryByText('Share with a business')).toBeNull();
  });

  it('keeps ended, declined and withdrawn splits out of the way until asked', async () => {
    const ended = samSplit({ id: 's-old', status: 'ended', ended_on: '2026-09-30', can: NO_ACTIONS, calendar: { id: 'cal-old', name: 'Old' } });
    currentList = list({ splits: [samSplit(), ended] });
    await show();
    const past = section('past');
    expect(within(past).queryByText('Old at Sam Cuts')).toBeNull();
    await press(within(past).getByText('Show past splits (1)'));
    expect(within(past).getByText('Old at Sam Cuts')).toBeTruthy();
    expect(within(past).getByText('Ended')).toBeTruthy();
    // Nothing is left to manage on a past split: its button opens the record (web the same).
    expect(within(past).getByLabelText('See details: Old at Sam Cuts')).toBeTruthy();
    await press(within(past).getByText('Hide'));
    expect(within(past).queryByText('Old at Sam Cuts')).toBeNull();
  });

  it('opens a split from its line', async () => {
    await show();
    await press(within(section('partners')).getByLabelText('Manage: Sam at Sam Cuts'));
    expect(mockPush).toHaveBeenCalledWith('/commission-splits/s-sam');
  });
});

describe('waiting for your answer', () => {
  it('shows the proposal at the top in plain words and accepts it', async () => {
    const proposal = jessProposal();
    const accepted: SplitView = { ...proposal, status: 'active', terms: { ...proposal.pending!, status: 'accepted' }, pending: null, can: NO_ACTIONS };
    currentList = list({ splits: [samSplit(), proposal] });
    onWrite = (call) => {
      if (call.path.endsWith('/respond')) {
        currentList = list({ splits: [samSplit(), accepted] });
        return { split: accepted };
      }
      throw new Error(`unexpected ${call.path}`);
    };
    await show();
    const waiting = section('answer');
    expect(within(waiting).getByText('Waiting for your answer')).toBeTruthy();
    expect(within(waiting).getByText('Nothing counts until you accept.')).toBeTruthy();
    expect(within(waiting).getByText('Jess at Bloom Hair')).toBeTruthy();
    expect(within(waiting).getByText('Sam Cuts proposed this split')).toBeTruthy();
    expect(within(waiting).getByText('You pay Sam Cuts 10% of services, as a fee.')).toBeTruthy();
    expect(within(waiting).getByText('Worked out before VAT, from 2 November 2026. Settle up weekly.')).toBeTruthy();
    // The proposal sits on Jess's calendar too, waiting.
    expect(within(section('calendars')).getByText('Proposed: you pay Sam Cuts 10% of services, as a fee.')).toBeTruthy();
    await press(within(waiting).getByText('Accept'));
    expect(await screen.findByText('Accepted. It counts from 2 November 2026.')).toBeTruthy();
    expect(writes()).toEqual([{ path: `${SPLITS}/s-jess/respond`, method: 'POST', body: { terms_id: 't-jess', action: 'accept' } }]);
    await waitFor(() => expect(screen.queryByTestId('answer')).toBeNull());
    expect(within(section('calendars')).getByText('You pay Sam Cuts 10% of services, as a fee.')).toBeTruthy();
  });

  it("declines, and opens the proposal's details", async () => {
    const proposal = jessProposal();
    currentList = list({ splits: [samSplit(), proposal] });
    onWrite = () => ({ split: { ...proposal, status: 'declined', pending: null, can: NO_ACTIONS } });
    await show();
    await press(within(section('answer')).getByText('See details'));
    expect(mockPush).toHaveBeenCalledWith('/commission-splits/s-jess');
    await press(within(section('answer')).getByText('Decline'));
    expect(writes()[0]!.body).toEqual({ terms_id: 't-jess', action: 'decline' });
    expect(await screen.findByText('Declined. Sam Cuts has been told.')).toBeTruthy();
  });

  it("shows the server's refusal beside the proposal", async () => {
    const NOT_PENDING = 'Those terms are no longer waiting for an answer.';
    currentList = list({ splits: [samSplit(), jessProposal()] });
    onWrite = () => {
      throw new ApiError(NOT_PENDING, 409, { error: NOT_PENDING, code: 'SPLIT_TERMS_NOT_PENDING' });
    };
    await show();
    await press(within(section('answer')).getByText('Accept'));
    expect(await within(section('answer')).findByText(NOT_PENDING)).toBeTruthy();
  });
});

describe('Set up a split', () => {
  it('sets the share for the person who works one of your calendars, saying what will count first', async () => {
    onWrite = (call) => {
      if (call.path !== SHARE) throw new Error(`unexpected ${call.path}`);
      currentSettings = settings({ rates: [...BASE_RATES, rate({ calendar_id: 'cal-kim', rate_bps: 3000, effective_from: '2026-10-14' })] });
      return { added: 2, ...currentSettings };
    };
    await show();
    const chooser = await openSetUp();
    expect(within(chooser).getByText('Whose takings are shared?')).toBeTruthy();
    expect(within(chooser).getByText('At Sam Cuts')).toBeTruthy();
    expect(within(chooser).getByText('Logins without a calendar')).toBeTruthy();
    await press(within(chooser).getByLabelText('Kim'));
    // Kim's calendar can only share with Kim: nobody else can see it, so Kim is chosen.
    // What Kim earns today follows, so choosing her reads as a change, not a fresh start.
    expect(
      within(chooser).getByText(
        'You pay them a share of what this calendar takes. For employed or self-employed team members. At the moment: 5% of services and 20% of products.',
      ),
    ).toBeTruthy();
    await press(within(chooser).getByText('Next'));

    const form = sheet();
    expect(within(form).getByText("Kim's share")).toBeTruthy();
    expect(within(form).getByText('What you pay Kim from what this calendar takes.')).toBeTruthy();
    expect(within(form).getByLabelText('Set their own rates').props.accessibilityState).toMatchObject({ selected: true });
    // Kim earns your standard 5% today, so that is where the field starts.
    expect(within(form).getByLabelText('Share of services (%)').props.value).toBe('5');
    await type(within(form).getByLabelText('Share of services (%)'), '30');
    await type(within(form).getByLabelText('Share of products (%)'), '10');
    expect(
      within(form).getByText('From 14 October 2026, you pay Kim 30% of services and 10% of products on their calendar, as their share.'),
    ).toBeTruthy();
    expect(within(form).getByText('For example, on £100.00 of services, Kim earns £30.00.')).toBeTruthy();
    await press(within(form).getByText('Save'));

    expect(
      await screen.findByText(
        'Saved. From 14 October 2026, you pay Kim 30% of services and 10% of products on their calendar, as their share.',
      ),
    ).toBeTruthy();
    expect(writes()).toEqual([
      {
        path: SHARE,
        method: 'POST',
        body: { person_key: 'c:cal-kim', label: 'their_share', effective_from: '2026-10-14', service_rate_percent: 30, product_rate_percent: 10 },
      },
    ]);
    expect(screen.queryByTestId('sheet')).toBeNull();
    await waitFor(() => expect(within(section('calendars')).getAllByText('Own rates')).toHaveLength(2));
  });

  it('offers a business that can see your calendar, and goes Back to the choice', async () => {
    await show();
    const chooser = await openSetUp();
    await press(within(chooser).getByLabelText('Jess'));
    // Jess, and Sam Cuts, which can see her calendar: nothing is chosen for you.
    expect(within(chooser).getAllByLabelText('Jess')).toHaveLength(2);
    expect(within(chooser).getByText('A business you work with')).toBeTruthy();
    expect(within(chooser).getByRole('button', { name: 'Next' })).toBeDisabled();
    await press(within(chooser).getByLabelText('Sam Cuts'));
    await press(within(chooser).getByText('Next'));
    const form = sheet();
    expect(within(form).getByText('Jess at Bloom Hair')).toBeTruthy();
    expect(
      within(form).getByText('You pay Sam Cuts a share of what this calendar takes, such as rent for a chair. Sam Cuts must accept first.'),
    ).toBeTruthy();
    await press(within(form).getByText('Back'));
    expect(within(sheet()).getByText('Whose takings are shared?')).toBeTruthy();
    // Back keeps the calendar chosen.
    expect(within(sheet()).getByText('Who earns a share?')).toBeTruthy();
  });

  it('proposes a share of a calendar at a business you work with, which they then accept', async () => {
    const proposed = samSplit({
      id: 's-nina',
      status: 'proposed',
      partner: NAIL,
      payer: NAIL,
      calendar: { id: 'cal-nina', name: 'Nina' },
      terms: null,
      pending: terms({ id: 't-nina', services_rate_bps: 3500, status: 'proposed', decided_at: null, effective_from: '2026-10-14' }),
      can: { ...NO_ACTIONS, withdraw: true },
    });
    onWrite = (call) => {
      if (call.path !== SPLITS) throw new Error(`unexpected ${call.path}`);
      currentList = list({ splits: [samSplit(), proposed] });
      return { split: proposed };
    };
    await show();
    // Straight from Nina's card: the calendar and the business are already chosen.
    await press(within(section('partners')).getByLabelText('Set up a split: Nina at Nail Studio'));
    const form = sheet();
    expect(within(form).getByText('Nina at Nail Studio')).toBeTruthy();
    expect(
      within(form).getByText('Nail Studio pays you a share of what this calendar takes, such as rent for a chair. Nail Studio must accept first.'),
    ).toBeTruthy();
    expect(within(form).queryByText('Business')).toBeNull();
    expect(within(form).queryByText('Back')).toBeNull();
    expect(within(form).getByRole('button', { name: 'Send to Nail Studio' })).toBeDisabled();
    await type(within(form).getByLabelText('Share of services (%)'), '35');
    expect(
      within(form).getByText(
        "From 14 October 2026, Nail Studio pays you 35% of services on Nina's calendar, worked out before VAT. It counts as rent and you settle up weekly. Nothing counts until Nail Studio accepts.",
      ),
    ).toBeTruthy();
    expect(await within(form).findByText('Last month this would have come to £70.00.', {}, { timeout: 3000 })).toBeTruthy();
    await press(within(form).getByText('Send to Nail Studio'));
    expect(await screen.findByText('Sent. Nail Studio needs to accept it before it counts.')).toBeTruthy();
    expect(writes()[0]).toMatchObject({
      path: SPLITS,
      method: 'POST',
      body: {
        calendar_id: 'cal-nina',
        other_venue_id: 'v-nail',
        label: 'rent',
        services_rate_percent: 35,
        products_rate_percent: null,
        settlement_period: 'weekly',
        effective_from: '2026-10-14',
        vat_basis: 'net_ex_vat',
      },
    });
    expect(within(section('partners')).getByText('Proposed: Nail Studio pays you 35% of services, as rent.')).toBeTruthy();
    expect(within(section('partners')).getByText('Waiting for Nail Studio')).toBeTruthy();
  });

  it('checks the shares before sending, and says when it starts before today', async () => {
    await show();
    await press(within(section('partners')).getByLabelText('Set up a split: Nina at Nail Studio'));
    const form = sheet();
    await type(within(form).getByLabelText('Share of services (%)'), '120');
    await press(within(form).getByText('Send to Nail Studio'));
    expect(within(form).getByText('Enter a percentage from 0 to 100.')).toBeTruthy();
    await type(within(form).getByLabelText('Share of services (%)'), '12.345');
    await press(within(form).getByText('Send to Nail Studio'));
    expect(within(form).getByText('Use up to two decimal places.')).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await act(async () => {
      fireEvent(within(form).getByLabelText('Starts on'), 'valueChange', {}, new Date(2026, 9, 1, 12));
    });
    expect(within(form).getByText('This starts before today, so figures already in ResNeo will count once Nail Studio agrees.')).toBeTruthy();
  });

  it('marks a pairing that already has a split instead of offering it twice', async () => {
    await show();
    const chooser = await openSetUp();
    await press(within(chooser).getByLabelText('Sam'));
    expect(within(chooser).getByText('Already set up. Manage it from the list.')).toBeTruthy();
    expect(within(chooser).getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('shares one of your calendars with a business straight from its card', async () => {
    await show();
    await press(within(section('calendars')).getByText('Share with a business'));
    const chooser = sheet();
    // Only the business is offered, and so it is chosen.
    expect(within(chooser).getAllByLabelText('Jess')).toHaveLength(1);
    expect(within(chooser).getByLabelText('Sam Cuts')).toBeTruthy();
    await press(within(chooser).getByText('Next'));
    expect(within(sheet()).getByText('Jess at Bloom Hair')).toBeTruthy();
  });
});

describe('changing a share', () => {
  it('puts a person back on your standard rates', async () => {
    onWrite = () => ({ added: 1, ...currentSettings });
    await show();
    await press(screen.getByLabelText("Change: Jess's share"));
    const form = sheet();
    expect(within(form).getByText("Jess's share")).toBeTruthy();
    expect(within(form).getByLabelText('Share of services (%)').props.value).toBe('40');
    await press(within(form).getByLabelText('Use your standard rates'));
    expect(within(form).getByText('5% of services and 20% of products')).toBeTruthy();
    expect(
      within(form).getByText('From 14 October 2026, you pay Jess 5% of services and 20% of products on their calendar, as commission.'),
    ).toBeTruthy();
    await press(within(form).getByText('Save'));
    expect(writes()[0]).toEqual({
      path: SHARE,
      method: 'POST',
      body: { person_key: 'c:cal-jess', label: 'commission', effective_from: '2026-10-14', service_rate_percent: null, product_rate_percent: null },
    });
  });

  it('shows the server sentence beside the field it is about', async () => {
    const NO_DATE = 'Choose the date it starts.';
    onWrite = () => {
      throw new ApiError(NO_DATE, 400, { error: NO_DATE, code: 'VALIDATION_FAILED', fields: [{ path: 'effective_from', message: NO_DATE }] });
    };
    await show();
    await press(screen.getByLabelText("Change: Jess's share"));
    await type(within(sheet()).getByLabelText('Share of services (%)'), '45');
    await press(within(sheet()).getByText('Save'));
    expect(await within(sheet()).findByText(NO_DATE)).toBeTruthy();
    expect(within(sheet()).getAllByText(NO_DATE)).toHaveLength(1);
  });

  it('only closes when Save is pressed with nothing changed', async () => {
    await show();
    await press(screen.getByLabelText("Change: Jess's share"));
    const form = sheet();
    expect(within(form).getByText('Only changes the word used on reports.')).toBeTruthy();
    expect(within(form).getByText('The first day the new share counts. Days before it keep the rates they had.')).toBeTruthy();
    await press(within(form).getByText('Save'));
    expect(writes()).toHaveLength(0);
    expect(screen.queryByTestId('sheet')).toBeNull();
  });

  it("leaves products out for someone who earns none where Checkout isn't set up, and checks the share", async () => {
    currentSettings = settings({ rates: [], source: { value: 'bookings', setting: 'auto', checkout_available: false } });
    onWrite = () => ({ added: 1, ...currentSettings });
    await show();
    await press(screen.getByLabelText("Set a share: Kim's share"));
    const form = sheet();
    expect(within(form).getByText('Your standard rates are 0% at the moment.')).toBeTruthy();
    expect(within(form).queryByLabelText('Share of products (%)')).toBeNull();
    await press(within(form).getByText('Save'));
    expect(within(form).getByText('Enter a percentage from 0 to 100.')).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await type(within(form).getByLabelText('Share of services (%)'), '25');
    await press(within(form).getByText('Commission'));
    await press(within(form).getByText('Save'));
    expect(writes()[0]!.body).toEqual({ person_key: 'c:cal-kim', label: 'commission', effective_from: '2026-10-14', service_rate_percent: 25 });
  });

  it('warns when a share starts before today', async () => {
    await show();
    await press(screen.getByLabelText("Change: Jess's share"));
    await act(async () => {
      fireEvent(within(sheet()).getByLabelText('Starts on'), 'valueChange', {}, new Date(2026, 9, 1, 12));
    });
    expect(within(sheet()).getByText('This starts before today, so figures already worked out from 1 October 2026 will change.')).toBeTruthy();
    expect(within(sheet()).getByText(/^From 1 October 2026, you pay Jess/)).toBeTruthy();
  });

  it("lists, stops and adds a person's own category rates, and shows their earlier rates", async () => {
    onWrite = () => ({ rate: {}, ...currentSettings });
    await show();
    await press(screen.getByLabelText("Change: Jess's share"));
    const form = sheet();
    await press(within(form).getByText('Rates for one category (1)'));
    expect(within(form).getByText('Colour (Services): 50%, from 1 September 2026')).toBeTruthy();
    await press(within(form).getByText('Stop this rate'));
    expect(writes()[0]!.body).toEqual({
      calendar_id: 'cal-jess',
      staff_id: null,
      effective_from: '2026-10-14',
      item_type: 'service',
      category_id: 'colour',
      rate_percent: null,
    });
    await press(within(form).getByLabelText('Colour (Services)'));
    await type(within(form).getByLabelText('Rate (%)'), '12');
    await press(within(form).getByText('Add a category rate'));
    expect(writes()[1]).toEqual({
      path: RATES,
      method: 'POST',
      body: { calendar_id: 'cal-jess', staff_id: null, effective_from: '2026-10-14', item_type: 'service', category_id: 'colour', rate_percent: 12 },
    });
    await press(within(form).getByText('Earlier rates'));
    expect(within(form).getByText('Services: 40%, from 1 September 2026')).toBeTruthy();
    expect(within(form).getByText('Services, Colour: 50%, from 1 September 2026')).toBeTruthy();
  });
});

describe('standard rates and how figures are worked out', () => {
  it('shows each standard rate, the placeholders and which rate wins', async () => {
    await show();
    expect(screen.getByText('What your team earns unless a calendar has its own rates.')).toBeTruthy();
    expect(screen.getByText('5%, from 1 January 2026')).toBeTruthy();
    expect(screen.getByText('20%, from 1 January 2026')).toBeTruthy();
    expect(screen.getByText(/^0% · Usually 0%/)).toBeTruthy();
    expect(screen.getByText(/a calendar's own rate for a category, then its own rate/)).toBeTruthy();
    // Jess's own rates are on her calendar, not in a list of people.
    expect(screen.queryByText('For one person')).toBeNull();
    expect(screen.queryByText('People')).toBeNull();
  });

  it('changes the rate for everyone from a date', async () => {
    onWrite = () => {
      currentSettings = settings({ rates: [...BASE_RATES, rate({ id: 'r-voucher', item_type: 'voucher', rate_bps: 1250, effective_from: '2026-10-14' })] });
      return { rate: {}, ...currentSettings };
    };
    await show();
    await press(screen.getAllByText('Change rate')[2]!); // Gift vouchers (placeholder)
    // It names the rate it changes and starts on the rate in force today.
    expect(within(sheet()).getByText('Standard rate for gift vouchers')).toBeTruthy();
    expect(within(sheet()).getByLabelText('Rate (%)').props.value).toBe('0');
    expect(within(sheet()).getByText('At the moment: 0%.')).toBeTruthy();
    await type(within(sheet()).getByLabelText('Rate (%)'), '120');
    await press(within(sheet()).getByText('Save changes'));
    expect(within(sheet()).getByText('Enter a percentage from 0 to 100.')).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await type(within(sheet()).getByLabelText('Rate (%)'), '12,5');
    expect(
      within(sheet()).getByText('From 14 October 2026, your team earns 12.5% of gift vouchers, unless a calendar has its own rate.'),
    ).toBeTruthy();
    await press(within(sheet()).getByText('Save changes'));
    expect(writes()[0]).toEqual({
      path: RATES,
      method: 'POST',
      body: { item_type: 'voucher', category_id: null, calendar_id: null, staff_id: null, rate_percent: 12.5, effective_from: '2026-10-14' },
    });
    expect(mockToast.success).toHaveBeenCalledWith('Commission rate saved.');
    expect(await screen.findByText(/^12\.5%, from 14 October 2026/)).toBeTruthy();
  });

  it('only closes when the same rate is saved from today', async () => {
    await show();
    await press(screen.getAllByText('Change rate')[0]!); // Services, 5% today
    expect(within(sheet()).getByText('Standard rate for services')).toBeTruthy();
    expect(within(sheet()).getByLabelText('Rate (%)').props.value).toBe('5');
    await press(within(sheet()).getByText('Save changes'));
    expect(writes()).toHaveLength(0);
    expect(screen.queryByTestId('sheet')).toBeNull();
  });

  it('adds, stops and shows the earlier versions of a standard category rate', async () => {
    currentSettings = settings({
      rates: [
        ...BASE_RATES,
        rate({ id: 'r-c1', category_id: 'colour', category_name: 'Colour', rate_bps: 800 }),
        rate({ id: 'r-c2', category_id: 'colour', category_name: 'Colour', rate_bps: 900, effective_from: '2026-06-01' }),
      ],
    });
    onWrite = () => ({ rate: {}, ...currentSettings });
    await show();
    expect(screen.getByText('Colour (Services)')).toBeTruthy();
    await press(screen.getAllByText('Earlier rates').at(-1)!);
    expect(screen.getAllByText(/^(8|9)%, from /).map((n) => n.props.children)).toEqual([
      '9%, from 1 June 2026',
      '9%, from 1 June 2026',
      '8%, from 1 January 2026',
    ]);
    await press(screen.getByText('Stop this rate'));
    expect(writes()[0]!.body).toEqual({
      item_type: 'service',
      category_id: 'colour',
      calendar_id: null,
      staff_id: null,
      rate_percent: null,
      effective_from: '2026-10-14',
    });
    await press(screen.getByText('Add a category rate'));
    expect(within(sheet()).getByText('Choose a category')).toBeTruthy();
    await type(within(sheet()).getByLabelText('Rate (%)'), '5');
    expect(within(sheet()).getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await press(within(sheet()).getByLabelText('Colour'));
    await press(within(sheet()).getByText('Save changes'));
    expect(writes()[1]!.body).toMatchObject({ item_type: 'service', category_id: 'colour', calendar_id: null, staff_id: null, rate_percent: 5 });
  });

  it('saves what counts for services at once, with the settings version', async () => {
    onWrite = () => settings({ source: { value: 'bookings', setting: 'bookings', checkout_available: true }, settings_version: 4 });
    await show();
    expect(screen.getByText('How figures are worked out')).toBeTruthy();
    await press(screen.getByText('Completed bookings'));
    expect(writes()[0]).toEqual({ path: SETTINGS, method: 'PATCH', body: { version: 3, commission_source: 'bookings' } });
    expect(mockToast.success).toHaveBeenCalledWith('Saved. The report now counts services from completed bookings.');
  });

  it('saves the VAT basis at once', async () => {
    onWrite = () => settings({ basis: { value: 'net_inc_vat', editable: true, vat_registered: true }, settings_version: 4 });
    await show();
    await press(screen.getByText('Prices including VAT'));
    expect(writes()[0]).toEqual({ path: SETTINGS, method: 'PATCH', body: { version: 3, commission_basis: 'net_inc_vat' } });
    expect(mockToast.success).toHaveBeenCalledWith('Saved.');
  });

  it('shows a stale answer word for word beside the fresh settings', async () => {
    onWrite = () => {
      throw new ApiError(STALE, 412, { error: STALE, code: 'STALE_RESOURCE', settings: settings({ settings_version: 9 }) });
    };
    await show();
    await press(screen.getByText('Prices including VAT'));
    expect(await screen.findByText(STALE)).toBeTruthy();
    expect(mockToast.success).not.toHaveBeenCalled();
  });
});

describe('ways forward', () => {
  it('links to what is owed in Reports and to the help article', async () => {
    await show();
    await press(screen.getByText('See what is owed in Reports'));
    expect(mockPush).toHaveBeenCalledWith('/reports?tab=commission');
    await press(screen.getByText('How commission splits work'));
    expect(mockOpenBrowser).toHaveBeenCalledWith('https://www.resneo.com/help/settings/commission-splits');
  });

  it('with no calendars, says why nothing is listed and where calendars are added', async () => {
    currentSettings = settings({ people: [] });
    currentList = list({ splits: [], partners: [] });
    await show();
    expect(screen.getByText('You have no calendars yet.')).toBeTruthy();
    await press(screen.getByText('Add a calendar'));
    expect(mockPush).toHaveBeenCalledWith('/availability?tab=team');
    mockPush.mockClear();
    await press(screen.getAllByText('Set up a split')[0]!);
    const chooser = sheet();
    expect(within(chooser).getByText('There are no calendars to choose yet. Add a calendar first, then come back to set up a split.')).toBeTruthy();
    expect(within(chooser).queryByText('Next')).toBeNull();
    await press(within(chooser).getByText('Add a calendar'));
    expect(mockPush).toHaveBeenCalledWith('/availability?tab=team');
  });
});
