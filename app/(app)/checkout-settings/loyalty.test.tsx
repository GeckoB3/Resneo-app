/**
 * Settings, Loyalty card in the app (web `LoyaltyCard`): the gates, the first set-up sending every
 * field at version 0, later saves sending only what changed, a stale save keeping the edits, the
 * server's refusal word for word, Pause (after a confirm) and Start again saving at once, the free
 * service picker and the preview.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

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
let mockLoyaltyOn = true;
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({
    data: { id: 'venue-1', feature_flags: { resolved: { pos_enabled: true, pos_loyalty_enabled: mockLoyaltyOn } } },
  }),
}));
jest.mock('@/lib/queries/usePos', () => ({
  usePosEnabled: () => true,
  usePosGate: () => ({ accessToken: 'tok', enabled: true }),
}));
type Call = { path: string; method: string; body: Record<string, unknown> | null };
const mockCalls: Call[] = [];
let mockHandler: (call: Call) => unknown = () => ({});
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return {
    ...actual,
    apiFetch: async (path: string, init: { method?: string; body?: string } = {}) => {
      const call = { path, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null };
      mockCalls.push(call);
      return mockHandler(call);
    },
  };
});

import { ApiError } from '@/lib/api/client';
import type { LoyaltyProgramme } from '@/lib/pos/settings-more/types';

import LoyaltySettingsScreen from './loyalty';

const STALE =
  "Someone else changed these settings while you were editing. We've loaded their changes. Check them, then save yours again.";

let mockIsAdmin = true;
function settingsResponse() {
  return {
    settings: { trading_name: null, track_stock_enabled: false, version: 1 },
    staff_capability_map: {},
    can: { is_admin: mockIsAdmin, manage_settings: true, edit_capabilities: true },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
  };
}

function programme(over: Partial<LoyaltyProgramme> = {}): LoyaltyProgramme {
  return {
    id: 'p1',
    name: 'Loyalty card',
    stamps_needed: 6,
    qualifying_service_item_ids: null,
    reward_kind: 'amount',
    reward_service_item_ids: null,
    reward_amount_pence: 500,
    reward_percent_bps: null,
    reward_valid_days: null,
    started_on: '2026-10-09',
    status: 'active',
    reward_email_enabled: true,
    version: 3,
    set_up: true,
    ...over,
  };
}

const SERVICES = [
  { id: 's1', name: 'Cut', price_pence: 3000 },
  { id: 's2', name: 'Colour', price_pence: 6500 },
];

function answer(p: LoyaltyProgramme) {
  return { programme: p, services: SERVICES, can: { edit: true }, today: '2026-10-09' };
}

/** GET settings and loyalty from `current`; PUT answers from `onPut`. */
let current: LoyaltyProgramme = programme();
let onPut: (body: Record<string, unknown>) => unknown = (body) => {
  current = { ...current, ...body, version: current.version + 1, set_up: true } as LoyaltyProgramme;
  return answer(current);
};

beforeEach(() => {
  mockCalls.length = 0;
  mockToast.success.mockClear();
  mockIsAdmin = true;
  mockLoyaltyOn = true;
  current = programme();
  onPut = (body) => {
    current = { ...current, ...body, version: current.version + 1, set_up: true } as LoyaltyProgramme;
    return answer(current);
  };
  mockHandler = (call) => {
    if (call.path === '/api/venue/pos/settings') return settingsResponse();
    if (call.path === '/api/venue/pos/loyalty/programme' && call.method === 'GET') return answer(current);
    if (call.path === '/api/venue/pos/loyalty/programme' && call.method === 'PUT') return onPut(call.body ?? {});
    throw new Error(`unexpected ${call.method} ${call.path}`);
  };
});

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <LoyaltySettingsScreen />
    </QueryClientProvider>,
  );
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

const puts = () => mockCalls.filter((c) => c.method === 'PUT');

describe('the gates', () => {
  it('says the feature is off when the venue has no loyalty cards', async () => {
    mockLoyaltyOn = false;
    await show();
    expect(await screen.findByText('Loyalty is switched off')).toBeTruthy();
    expect(mockCalls.some((c) => c.path.includes('loyalty'))).toBe(false);
  });

  it('is for admins only', async () => {
    mockIsAdmin = false;
    await show();
    expect(await screen.findByText('For admins')).toBeTruthy();
    expect(mockCalls.some((c) => c.path.includes('loyalty'))).toBe(false);
  });
});

describe('the first set-up', () => {
  it('shows the set-up note and sends every field at version 0', async () => {
    current = programme({ id: null, version: 0, set_up: false });
    await show();
    expect(
      await screen.findByText('Loyalty cards are ready to set up. Choose how many visits fill a card and what the reward is.'),
    ).toBeTruthy();
    expect(screen.queryByText('Pause the card')).toBeNull();
    await press(screen.getByText('Save changes'));
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.body).toEqual({
      name: 'Loyalty card',
      stamps_needed: 6,
      qualifying_service_item_ids: null,
      reward_kind: 'amount',
      reward_service_item_ids: null,
      reward_amount_pence: 500,
      reward_percent_bps: null,
      reward_valid_days: null,
      started_on: '2026-10-09',
      reward_email_enabled: true,
      version: 0,
    });
    expect(mockToast.success).toHaveBeenCalledWith('Loyalty card saved.');
  });
});

describe('saving a set-up card', () => {
  it('sends only what changed, with the version', async () => {
    await show();
    await type(await screen.findByLabelText('Name'), 'Stamp card');
    await type(screen.getByLabelText('Visits to fill the card'), '1');
    await type(screen.getByLabelText('Visits to fill the card'), '12');
    await press(screen.getByText('Save changes'));
    expect(puts()[0]!.body).toEqual({ name: 'Stamp card', stamps_needed: 12, version: 3 });
  });

  it('chooses some services, the free service and the days a reward lasts', async () => {
    await show();
    await press(await screen.findByText('Only these services'));
    await press(screen.getByText('Colour'));
    await press(screen.getByText('A free service'));
    await press(screen.getByText('Choose a service'));
    expect(screen.getByText(/Cut \(.*30\.00\)/)).toBeTruthy();
    await press(screen.getByText(/Colour \(.*65\.00\)/));
    await press(screen.getByText("A number of days after it's earned"));
    expect(screen.getByText("90 days after it's earned")).toBeTruthy();
    await press(screen.getByText('Save changes'));
    expect(puts()[0]!.body).toEqual({
      qualifying_service_item_ids: ['s2'],
      reward_kind: 'free_service',
      reward_service_item_ids: ['s2'],
      reward_valid_days: 90,
      version: 3,
    });
  });

  it('a percentage reward is sent in basis points', async () => {
    await show();
    await press(await screen.findByText('A percentage off'));
    await type(screen.getAllByLabelText('A percentage off').at(-1)!, '12.5');
    await press(screen.getByText('Save changes'));
    expect(puts()[0]!.body).toEqual({ reward_kind: 'percent', reward_percent_bps: 1250, version: 3 });
  });

  it('a stale save loads the fresh card, keeps the edits and says so', async () => {
    await show();
    await type(await screen.findByLabelText('Name'), 'Stamp card');
    onPut = () => {
      current = programme({ version: 4, stamps_needed: 8 });
      throw new ApiError(STALE, 412, { error: STALE, code: 'POS_SETTINGS_STALE', programme: current });
    };
    await press(screen.getByText('Save changes'));
    expect(await screen.findByText(STALE)).toBeTruthy();
    expect(screen.getByLabelText('Name').props.value).toBe('Stamp card');
    expect(screen.getByLabelText('Visits to fill the card').props.value).toBe('8');
    expect(screen.getByText('Use their changes')).toBeTruthy();
    onPut = (body) => answer({ ...current, ...body, version: 5 } as LoyaltyProgramme);
    await press(screen.getByText('Save changes'));
    expect(puts()[1]!.body).toEqual({ name: 'Stamp card', version: 4 });
  });

  it("shows the server's refusal word for word, beside the field it names", async () => {
    await show();
    await press(await screen.findByText('A free service'));
    onPut = () => {
      throw new ApiError('Choose the service the reward is for.', 400, {
        error: 'Choose the service the reward is for.',
        code: 'VALIDATION_FAILED',
        fields: [{ path: 'reward_service_item_ids', message: 'Choose the service the reward is for.' }],
      });
    };
    await press(screen.getByText('Save changes'));
    expect(await screen.findAllByText('Choose the service the reward is for.')).toHaveLength(2);
  });
});

describe('pause and start again', () => {
  it('asks before pausing, then saves at once', async () => {
    await show();
    await press(await screen.findByText('Pause the card'));
    expect(screen.getByText('Pause the loyalty card?')).toBeTruthy();
    expect(screen.getByText("Nobody earns stamps while it's paused. Rewards already earned can still be used.")).toBeTruthy();
    const buttons = screen.getAllByText('Pause the card');
    await press(buttons[buttons.length - 1]!);
    expect(puts()[0]!.body).toEqual({ status: 'paused', version: 3 });
    expect(await screen.findByText('Paused. Nobody is earning stamps.')).toBeTruthy();
    expect(screen.getByText('Start again')).toBeTruthy();
  });

  it('starts again without a confirm', async () => {
    current = programme({ status: 'paused' });
    await show();
    expect(await screen.findByText('Paused. Nobody is earning stamps.')).toBeTruthy();
    await press(screen.getByText('Start again'));
    expect(puts()[0]!.body).toEqual({ status: 'active', version: 3 });
  });
});

describe('the preview', () => {
  it('shows the card the way clients see it', async () => {
    await show();
    expect(await screen.findByText('How your clients see it')).toBeTruthy();
    expect(screen.getByText('2 of 6 visits at Studio')).toBeTruthy();
    expect(screen.getByText(/When the card is full: .*5\.00 off\./)).toBeTruthy();
    expect(screen.getAllByTestId('stamp-filled')).toHaveLength(2);
    expect(screen.getAllByTestId('stamp-empty')).toHaveLength(4);
    expect(screen.getByText('Email clients when they earn a reward')).toBeTruthy();
  });
});
