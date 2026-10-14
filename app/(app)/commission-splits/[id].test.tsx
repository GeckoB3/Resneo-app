/**
 * One split with another business (web Manage dialog and statements; 2026-10-14): the admin gate,
 * the head in words (what it shares, how it is worked out and settled), answering the other business's proposal (with the worked example), what you sent and Withdraw,
 * "Propose new terms" with its date check, "End this split", Earlier terms, and the statements:
 * newest first, the totals, who marked a period paid, the note when figures changed since, "Mark as
 * paid" with a note, Undo after a question, and a split the link no longer allows being read only.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import type { SplitPeriodView, SplitStatementsResponse, SplitTermsView, SplitView } from '@/types/commission-splits';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 's-1' }),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
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

import SplitDetailScreen from './[id]';

const BASE = '/api/venue/commission/splits/s-1';

function terms(over: Partial<SplitTermsView> = {}): SplitTermsView {
  return {
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
    created_at: '2026-09-20T09:00:00Z',
    terms: terms(),
    pending: null,
    history: [terms()],
    ended_on: null,
    end_reason: null,
    ended_by_you: null,
    can: { respond: false, withdraw: false, propose_change: true, end: true },
    ...over,
  };
}

const AUG: SplitPeriodView = {
  start: '2026-08-01',
  end: '2026-08-31',
  status: 'outstanding',
  services_pence: 90000,
  products_pence: 0,
  owed_pence: 36000,
  settlement: null,
};
const SEP: SplitPeriodView = {
  start: '2026-09-01',
  end: '2026-09-30',
  status: 'paid',
  services_pence: 55000,
  products_pence: 0,
  owed_pence: 22000,
  settlement: {
    id: 'st-1',
    amount_pence: 20000,
    note: 'Bank transfer',
    marked_at: '2026-10-05T10:00:00Z',
    marked_by_you: false,
    marked_by_name: 'Sam Cuts',
    changed: true,
  },
};
const OCT: SplitPeriodView = {
  start: '2026-10-01',
  end: '2026-10-31',
  status: 'current',
  services_pence: 40000,
  products_pence: 0,
  owed_pence: 16000,
  settlement: null,
};

function statements(over: Partial<SplitStatementsResponse> = {}): SplitStatementsResponse {
  return {
    split: split(),
    // Out of order on purpose: the screen shows the newest first.
    periods: [AUG, OCT, SEP],
    outstanding_pence: 36000,
    paid_pence: 20000,
    currency: 'GBP',
    vat_note: false,
    ...over,
  };
}

let current: SplitStatementsResponse;
let onWrite: (call: Call) => unknown;

beforeEach(() => {
  mockCalls.length = 0;
  mockToast.success.mockClear();
  mockReplace.mockClear();
  mockRole = 'admin';
  current = statements();
  onWrite = () => ({ split: current.split });
  mockHandler = (call) => {
    if (call.method !== 'GET') return onWrite(call);
    if (call.path === `${BASE}/statements`) return current;
    if (call.path === '/api/venue/commission/splits') {
      return { today: '2026-10-14', currency: 'GBP', venue: { venue_id: 'venue-1', name: 'Bloom' }, basis_default: 'net_ex_vat', splits: [current.split], partners: [] };
    }
    if (call.path.startsWith('/api/venue/commission/splits/preview?')) {
      return { from: '2026-09-01', to: '2026-09-30', currency: 'GBP', services_pence: 55000, products_pence: 0, services_owed_pence: 22000, products_owed_pence: 0, owed_pence: 22000, vat_note: false };
    }
    throw new Error(`unexpected ${call.method} ${call.path}`);
  };
});

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SplitDetailScreen />
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

const writes = () => mockCalls.filter((c) => c.method !== 'GET');

describe('the gate', () => {
  it('is for admins only', async () => {
    mockRole = 'staff';
    await show();
    expect(screen.getByText('Only admins can manage commission splits.')).toBeTruthy();
    expect(mockCalls).toEqual([]);
  });

  it('says when the split no longer exists (or this venue is not party to it)', async () => {
    mockHandler = (call) => {
      if (call.path === `${BASE}/statements`) throw new ApiError('That split no longer exists.', 404, { error: 'That split no longer exists.', code: 'NOT_FOUND' });
      return { today: '2026-10-14', currency: 'GBP', venue: { venue_id: 'venue-1', name: 'Bloom' }, basis_default: 'net_ex_vat', splits: [], partners: [] };
    };
    await show();
    expect(await screen.findByText('That split no longer exists.')).toBeTruthy();
    await press(screen.getByText('Manage splits'));
    expect(mockReplace).toHaveBeenCalledWith('/commission-splits?section=businesses');
  });
});

describe('the split', () => {
  it('leads with what it shares in words, how it is worked out and settled, and keeps its earlier terms', async () => {
    current = statements({ split: split({ history: [terms({ id: 't-0', version: 1, status: 'declined', services_rate_bps: 5000 }), terms({ version: 2 })] }) });
    await show();
    expect(await screen.findByText('Sam at Sam Cuts')).toBeTruthy();
    expect(screen.getByText('Sam Cuts pays you 40% of services, as rent.')).toBeTruthy();
    expect(screen.getByText('Worked out before VAT, from 1 October 2026. Settle up monthly.')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    // The old head is gone: no "who pays · label", terms summary or settle-up line.
    expect(screen.queryByText('Sam Cuts pays you · Rent')).toBeNull();
    expect(screen.queryByText('40% of services from 1 October 2026')).toBeNull();
    expect(screen.queryByText('Settle up: Monthly')).toBeNull();
    await press(screen.getByText('Earlier terms'));
    expect(screen.getByText('Version 1: 50% of services, before VAT, from 1 October 2026 (declined)')).toBeTruthy();
  });

  it("answers the other business's proposal, with the worked example", async () => {
    const pending = terms({ id: 't-9', status: 'proposed', proposed_by_you: false, effective_from: '2026-11-01' });
    current = statements({
      split: split({ status: 'proposed', terms: null, pending, proposed_by_you: false, can: { respond: true, withdraw: false, propose_change: false, end: false } }),
      periods: [],
    });
    await show();
    expect(await screen.findByText('Sam Cuts proposed this split')).toBeTruthy();
    expect(screen.getByText('Needs your answer')).toBeTruthy();
    // Nothing is agreed yet, so the head says what was proposed, once.
    expect(screen.getByText('Sam Cuts pays you 40% of services, as rent.')).toBeTruthy();
    expect(screen.getByText('Worked out before VAT, from 1 November 2026. Settle up monthly.')).toBeTruthy();
    expect(screen.queryByText('40% of services from 1 November 2026')).toBeNull();
    expect(await screen.findByText('Last month this would have come to £220.00.', {}, { timeout: 3000 })).toBeTruthy();
    expect(mockCalls.some((c) => c.path === '/api/venue/commission/splits/preview?calendar_id=cal-sam&other_venue_id=v-sam&services_rate_percent=40&vat_basis=net_ex_vat')).toBe(true);
    await press(screen.getByText('Accept'));
    expect(writes()[0]).toEqual({ path: `${BASE}/respond`, method: 'POST', body: { terms_id: 't-9', action: 'accept' } });
    expect(mockToast.success).toHaveBeenCalledWith('Accepted. It counts from 1 November 2026.');
  });

  it('declines new terms the other business proposed', async () => {
    const pending = terms({ id: 't-9', version: 2, status: 'proposed', proposed_by_you: false, effective_from: '2026-12-01' });
    current = statements({ split: split({ pending, can: { respond: true, withdraw: false, propose_change: false, end: true } }) });
    await show();
    expect(await screen.findByText('Sam Cuts proposed new terms from 1 December 2026')).toBeTruthy();
    // The agreed terms lead; the new ones sit with the question.
    expect(screen.getByText('Sam Cuts pays you 40% of services, as rent.')).toBeTruthy();
    expect(screen.getByText('40% of services from 1 December 2026')).toBeTruthy();
    await press(screen.getByText('Decline'));
    expect(writes()[0]).toEqual({ path: `${BASE}/respond`, method: 'POST', body: { terms_id: 't-9', action: 'decline' } });
    expect(mockToast.success).toHaveBeenCalledWith('Declined. Sam Cuts has been told.');
  });

  it('shows the terms you sent, and withdraws them', async () => {
    const pending = terms({ id: 't-9', status: 'proposed', proposed_by_you: true, effective_from: '2026-11-01' });
    current = statements({
      split: split({ status: 'proposed', terms: null, pending, can: { respond: false, withdraw: true, propose_change: false, end: false } }),
      periods: [],
    });
    await show();
    expect(await screen.findByText('The terms you sent')).toBeTruthy();
    expect(screen.getByText('Waiting for Sam Cuts')).toBeTruthy();
    expect(screen.queryByText('Accept')).toBeNull();
    await press(screen.getByText('Withdraw'));
    expect(writes()[0]).toEqual({ path: `${BASE}/withdraw`, method: 'POST', body: { terms_id: 't-9' } });
    expect(mockToast.success).toHaveBeenCalledWith('Withdrawn.');
  });

  it('names new terms you proposed on an active split', async () => {
    const pending = terms({ id: 't-9', version: 2, status: 'proposed', proposed_by_you: true, effective_from: '2026-12-01' });
    current = statements({ split: split({ pending, can: { respond: false, withdraw: true, propose_change: false, end: true } }) });
    await show();
    expect(await screen.findByText('New terms you proposed from 1 December 2026')).toBeTruthy();
  });

  it("shows the server's refusal word for word", async () => {
    const NOT_PENDING = 'Those terms are no longer waiting for an answer.';
    const pending = terms({ id: 't-9', status: 'proposed', proposed_by_you: false });
    current = statements({ split: split({ status: 'proposed', terms: null, pending, can: { respond: true, withdraw: false, propose_change: false, end: false } }) });
    onWrite = () => {
      throw new ApiError(NOT_PENDING, 409, { error: NOT_PENDING, code: 'SPLIT_TERMS_NOT_PENDING' });
    };
    await show();
    await press(await screen.findByText('Accept'));
    expect(await screen.findByText(NOT_PENDING)).toBeTruthy();
  });
});

describe('changing and ending', () => {
  it('proposes new terms after the current ones began, with the shares filled in', async () => {
    await show();
    await press(await screen.findByText('Propose new terms'));
    const sheet = screen.getByTestId('sheet');
    expect(within(sheet).getByText('The current terms stay in force until Sam Cuts accepts.')).toBeTruthy();
    expect(within(sheet).getByLabelText('Share of services (%)').props.value).toBe('40');
    await act(async () => {
      fireEvent(within(sheet).getByLabelText('New terms start on'), 'valueChange', {}, new Date(2026, 9, 1, 12));
    });
    await press(within(sheet).getByText('Send to Sam Cuts'));
    expect(within(sheet).getByText('New terms must start after 1 October 2026, when the current terms began.')).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await act(async () => {
      fireEvent(within(sheet).getByLabelText('New terms start on'), 'valueChange', {}, new Date(2026, 11, 1, 12));
    });
    await act(async () => {
      fireEvent.changeText(within(sheet).getByLabelText('Share of services (%)'), '35');
    });
    await press(within(sheet).getByText('Send to Sam Cuts'));
    expect(writes()[0]).toEqual({
      path: `${BASE}/terms`,
      method: 'POST',
      body: { effective_from: '2026-12-01', services_rate_percent: 35, products_rate_percent: null, vat_basis: 'net_ex_vat' },
    });
    expect(mockToast.success).toHaveBeenCalledWith('Sent. The current terms stay in force until Sam Cuts accepts.');
  });

  it('ends the split after a last day of today or later', async () => {
    await show();
    await press(await screen.findByText('End this split'));
    const sheet = screen.getByTestId('sheet');
    expect(within(sheet).getByText('Sam Cuts will be told. Figures up to and including the last day still count.')).toBeTruthy();
    await act(async () => {
      fireEvent(within(sheet).getByLabelText('Last day it counts'), 'valueChange', {}, new Date(2026, 9, 10, 12));
    });
    await press(within(sheet).getByText('End split'));
    expect(within(sheet).getByText('The last day must be today or later.')).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await act(async () => {
      fireEvent(within(sheet).getByLabelText('Last day it counts'), 'valueChange', {}, new Date(2026, 9, 31, 12));
    });
    await press(within(sheet).getByText('End split'));
    expect(writes()[0]).toEqual({ path: `${BASE}/end`, method: 'POST', body: { last_day: '2026-10-31' } });
    expect(mockToast.success).toHaveBeenCalledWith('Ended. The last day it counts is 31 October 2026.');
  });
});

describe('statements', () => {
  it('lists each period newest first, with the totals, who marked it paid and what changed since', async () => {
    await show();
    expect(await screen.findByText('Outstanding: £360.00')).toBeTruthy();
    expect(screen.getByText('Marked paid: £200.00')).toBeTruthy();
    expect(
      screen.getByText('One statement per monthly period. Mark a period as paid once you have settled it. ResNeo does not move any money.'),
    ).toBeTruthy();
    const periods = screen.getAllByText(/^1 (August|September|October) 2026 to /).map((n) => n.props.children);
    expect(periods).toEqual(['1 October 2026 to 31 October 2026', '1 September 2026 to 30 September 2026', '1 August 2026 to 31 August 2026']);
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getByText('Outstanding')).toBeTruthy();
    expect(screen.getByText('Marked paid by Sam Cuts on 5 October 2026')).toBeTruthy();
    expect(screen.getByText('Note: Bank transfer')).toBeTruthy();
    expect(screen.getByText('The figures have changed since this was marked paid: it was £200.00 and is now £220.00.')).toBeTruthy();
    // Only the closed, unpaid period can be marked paid; only the marked one undone.
    expect(screen.getAllByText('Mark as paid')).toHaveLength(1);
    expect(screen.getAllByText('Undo')).toHaveLength(1);
  });

  it('marks a period paid with an optional note', async () => {
    onWrite = () => statements({ periods: [OCT, SEP, { ...AUG, status: 'paid' }] });
    await show();
    await press(await screen.findByText('Mark as paid'));
    const sheet = screen.getByTestId('sheet');
    expect(within(sheet).getByText('1 August 2026 to 31 August 2026: £360.00')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(within(sheet).getByLabelText('Note (optional)'), '  Bank transfer  ');
    });
    await press(within(sheet).getAllByText('Mark as paid').at(-1)!);
    expect(writes()[0]).toEqual({ path: `${BASE}/settlements`, method: 'POST', body: { period_start: '2026-08-01', note: 'Bank transfer' } });
    expect(mockToast.success).toHaveBeenCalledWith('Marked as paid.');
  });

  it('sends no note when none is written', async () => {
    onWrite = () => statements();
    await show();
    await press(await screen.findByText('Mark as paid'));
    const sheet = screen.getByTestId('sheet');
    await press(within(sheet).getAllByText('Mark as paid').at(-1)!);
    expect(writes()[0]!.body).toEqual({ period_start: '2026-08-01', note: null });
  });

  it('undoes a payment mark after asking', async () => {
    onWrite = () => statements();
    await show();
    await press(await screen.findByText('Undo'));
    const sheet = screen.getByTestId('sheet');
    expect(within(sheet).getByText('Undo the payment mark for 1 September 2026 to 30 September 2026?')).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await press(within(sheet).getByText('Undo'));
    expect(writes()[0]).toEqual({ path: `${BASE}/settlements/st-1/undo`, method: 'POST', body: undefined });
    expect(mockToast.success).toHaveBeenCalledWith('No longer marked as paid.');
  });

  it('says what a declined split proposed, with its status', async () => {
    const declined = terms({ id: 't-9', status: 'declined', services_rate_bps: 3500, effective_from: '2026-11-01' });
    current = statements({
      split: split({ status: 'declined', terms: null, pending: null, history: [declined], can: { respond: false, withdraw: false, propose_change: false, end: false } }),
      periods: [],
    });
    await show();
    expect(await screen.findByText('Sam Cuts pays you 35% of services, as rent.')).toBeTruthy();
    expect(screen.getByText('Worked out before VAT, from 1 November 2026. Settle up monthly.')).toBeTruthy();
    expect(screen.getByText('Declined')).toBeTruthy();
  });

  it('keeps a split the link no longer allows read only', async () => {
    current = statements({
      split: split({
        status: 'ended',
        ended_on: '2026-10-05',
        end_reason: 'link_ended',
        can: { respond: false, withdraw: false, propose_change: false, end: false },
      }),
    });
    await show();
    expect(await screen.findByText('It ended because the link or collective no longer allows it.')).toBeTruthy();
    expect(screen.getByText('The last day it counted was 5 October 2026.')).toBeTruthy();
    expect(
      screen.getByText('This split ended because the link or collective no longer allows it, so its statements can only be read.'),
    ).toBeTruthy();
    expect(screen.queryByText('Mark as paid')).toBeNull();
    expect(screen.queryByText('Undo')).toBeNull();
    expect(screen.queryByText('Propose new terms')).toBeNull();
    expect(screen.queryByText('End this split')).toBeNull();
  });
});
