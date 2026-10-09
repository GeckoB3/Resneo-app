/**
 * Settings, Cards on file in the app (web `CardsOnFileCard`, UX spec §9.10): the switch saves at
 * once at the loaded version and says what happened; a stale save says so; a login without
 * `manage_settings` sees it read only.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
  useRouter: () => ({ push: jest.fn() }),
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
jest.mock('@/lib/queries/usePos', () => ({
  usePosEnabled: () => true,
  usePosGate: (extra = true) => ({ accessToken: 'token-A', enabled: extra }),
}));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockHandler: (call: Call) => unknown = () => ({});
jest.mock('@/lib/pos/api', () => ({
  ...jest.requireActual<typeof import('@/lib/pos/api')>('@/lib/pos/api'),
  posFetch: (path: string, options: { method?: string; body?: unknown }) => {
    const call = { path, method: options.method ?? 'GET', body: options.body };
    mockCalls.push(call);
    try {
      return Promise.resolve(mockHandler(call));
    } catch (e) {
      return Promise.reject(e);
    }
  },
}));

import CardsOnFileScreen from './cards-on-file';

function settings(over: { canEdit?: boolean; on?: boolean; version?: number } = {}) {
  return {
    settings: { trading_name: null, track_stock_enabled: false, card_on_file_enabled: over.on ?? false, version: over.version ?? 5 },
    staff_capability_map: {},
    can: { is_admin: over.canEdit ?? true, manage_settings: over.canEdit ?? true, edit_capabilities: false },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
  };
}

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <CardsOnFileScreen />
    </QueryClientProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
}

async function toggle(label: string, value: boolean) {
  await act(async () => {
    fireEvent(screen.getByLabelText(label), 'valueChange', value);
  });
}

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = (call) => (call.path === '/api/venue/pos/settings' && call.method === 'GET' ? settings() : {});
});

it("uses the venue's word for its clients", async () => {
  await show();
  expect(await screen.findByText('Save cards when clients agree')).toBeTruthy();
  expect(screen.getByText(/A card is only saved when the client agrees/)).toBeTruthy();
});

it('turns cards on file on at the loaded version', async () => {
  await show();
  await screen.findByText('Save cards when clients agree');
  mockHandler = (call) => (call.method === 'PATCH' ? settings({ on: true, version: 6 }) : settings());
  await toggle('Save cards when clients agree', true);
  const patch = mockCalls.find((c) => c.method === 'PATCH')!;
  expect(patch.body).toEqual({ card_on_file_enabled: true, version: 5 });
  expect(screen.getByText('Cards on file are on.')).toBeTruthy();
});

it('says when someone else saved first', async () => {
  await show();
  await screen.findByText('Save cards when clients agree');
  mockHandler = (call) => {
    if (call.method === 'PATCH') throw new ApiError('stale', 412, { error: 'stale', code: 'POS_SETTINGS_STALE' });
    return settings({ version: 7 });
  };
  await toggle('Save cards when clients agree', true);
  expect(screen.getByText(/Someone else changed these settings while you were editing/)).toBeTruthy();
});

it('shows a refusal word for word', async () => {
  await show();
  await screen.findByText('Save cards when clients agree');
  mockHandler = (call) => {
    if (call.method === 'PATCH') throw new ApiError('no', 403, { error: "You don't have permission to change checkout settings.", code: 'POS_PERMISSION_DENIED' });
    return settings();
  };
  await toggle('Save cards when clients agree', true);
  expect(screen.getByText("You don't have permission to change checkout settings.")).toBeTruthy();
});

it('is read only without manage_settings', async () => {
  mockHandler = () => settings({ canEdit: false });
  await show();
  await screen.findByText('Save cards when clients agree');
  expect(screen.getByText(/Only an admin, or someone allowed to change checkout settings/)).toBeTruthy();
});
