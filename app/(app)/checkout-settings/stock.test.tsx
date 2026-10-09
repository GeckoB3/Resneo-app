/**
 * Settings, Stock in the app (web `TrackStockToggle` and `StockSettingsCard`, UX spec §9.11,
 * §9.16): turning Track stock on asks where to start (all from zero calls track-all after the
 * switch), turning it off asks first and shows the open-stocktake refusal word for word, and the
 * two stock options save together at the loaded version.
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

import StockSettingsScreen from './stock';

function settings(over: { track?: boolean; negative?: boolean; version?: number; canEdit?: boolean } = {}) {
  return {
    settings: {
      trading_name: null,
      track_stock_enabled: over.track ?? false,
      allow_negative_stock_at_till: over.negative ?? false,
      low_stock_digest: false,
      version: over.version ?? 2,
    },
    staff_capability_map: {},
    can: { is_admin: over.canEdit ?? true, manage_settings: over.canEdit ?? true, edit_capabilities: false },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
  };
}

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <StockSettingsScreen />
    </QueryClientProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
}

async function press(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

async function toggle(label: string, value: boolean) {
  await act(async () => {
    fireEvent(screen.getByLabelText(label), 'valueChange', value);
  });
}

beforeEach(() => {
  mockCalls.length = 0;
  mockToast.success.mockClear();
});

it('asks where to start, then tracks every product from zero', async () => {
  mockHandler = (call) => {
    if (call.method === 'PATCH') return settings({ track: true, version: 3 });
    if (call.path === '/api/venue/retail/stock/track-all') return { options: 12, products: 5 };
    return settings();
  };
  await show();
  await screen.findByText('Track stock');
  expect(screen.queryByText('Let the till sell more than the stock count says')).toBeNull();
  await toggle('Track stock', true);
  expect(screen.getByText('Start tracking stock?')).toBeTruthy();
  await press('Track all my products, starting at zero');
  const writes = mockCalls.filter((c) => c.method !== 'GET');
  expect(writes[0]).toMatchObject({ path: '/api/venue/pos/settings', method: 'PATCH', body: { track_stock_enabled: true, version: 2 } });
  expect(writes[1]).toMatchObject({ path: '/api/venue/retail/stock/track-all', method: 'POST' });
  expect(screen.getByText('Track stock is on.')).toBeTruthy();
});

it('starts with new products only without calling track-all', async () => {
  mockHandler = (call) => (call.method === 'PATCH' ? settings({ track: true, version: 3 }) : settings());
  await show();
  await screen.findByText('Track stock');
  await toggle('Track stock', true);
  await press('Only products I add from now on');
  expect(mockCalls.some((c) => c.path === '/api/venue/retail/stock/track-all')).toBe(false);
  expect(mockCalls.find((c) => c.method === 'PATCH')?.body).toEqual({ track_stock_enabled: true, version: 2 });
});

it('asks before turning off, and shows the open stocktake refusal word for word', async () => {
  const sentence = 'Finish or cancel your open stocktake before you turn off Track stock.';
  mockHandler = (call) => {
    if (call.method === 'PATCH') throw new ApiError(sentence, 409, { error: sentence, code: 'POS_FEATURE_IN_USE' });
    return settings({ track: true });
  };
  await show();
  await screen.findByText('Track stock');
  await toggle('Track stock', false);
  expect(screen.getByText('Turn off Track stock?')).toBeTruthy();
  expect(mockCalls.some((c) => c.method === 'PATCH')).toBe(false);
  await press('Turn off');
  expect(mockCalls.find((c) => c.method === 'PATCH')?.body).toEqual({ track_stock_enabled: false, version: 2 });
  expect(screen.getByText(sentence)).toBeTruthy();
});

it('saves the stock options together, sending only what changed', async () => {
  mockHandler = (call) =>
    call.method === 'PATCH' ? settings({ track: true, negative: true, version: 3 }) : settings({ track: true });
  await show();
  await screen.findByText('Let the till sell more than the stock count says');
  await toggle('Let the till sell more than the stock count says', true);
  await press('Save changes');
  expect(mockCalls.find((c) => c.method === 'PATCH')?.body).toEqual({ allow_negative_stock_at_till: true, version: 2 });
  expect(mockToast.success).toHaveBeenCalledWith('Stock settings saved.');
});

it('keeps the edit beside the fresh settings after a stale save', async () => {
  mockHandler = (call) => {
    if (call.method === 'PATCH') throw new ApiError('stale', 412, { error: 'stale', code: 'POS_SETTINGS_STALE' });
    return settings({ track: true, version: 4 });
  };
  await show();
  await screen.findByText('Let the till sell more than the stock count says');
  await toggle('Let the till sell more than the stock count says', true);
  await press('Save changes');
  expect(screen.getByText(/Someone else changed these settings while you were editing/)).toBeTruthy();
  expect(screen.getByText('Use their changes')).toBeTruthy();
});

it('is read only without manage_settings', async () => {
  mockHandler = () => settings({ track: true, canEdit: false });
  await show();
  await screen.findByText('Let the till sell more than the stock count says');
  expect(screen.queryByText('Save changes')).toBeNull();
});
