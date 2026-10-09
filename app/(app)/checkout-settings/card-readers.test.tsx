/**
 * Settings, Card readers in the app (web `CardReadersSection`, UX spec §9.8): who sees it, the
 * list with status and "Moved away", adding a reader by its pairing code (the server's refusal word
 * for word), removing after a confirm (a payment in progress refused with its own sentence), and
 * the test reader in test mode.
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

import CardReadersScreen from './card-readers';

function settings(over: { is_admin?: boolean; manage_readers?: boolean } = {}) {
  return {
    settings: { trading_name: null, track_stock_enabled: false, version: 3 },
    staff_capability_map: { manage_readers: over.manage_readers ?? false },
    can: { is_admin: over.is_admin ?? true, manage_settings: over.is_admin ?? true, edit_capabilities: over.is_admin ?? true },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
  };
}

const readerList = {
  can_take_cards: true,
  in_person_payments_enabled: true,
  test_mode: true,
  readers: [
    {
      id: 'r1',
      label: 'Front desk',
      model: 's700',
      serial_last4: '1234',
      till_id: 't1',
      default_for_till_ids: [],
      status: 'online',
      last_seen_at: new Date().toISOString(),
      is_active: true,
      inactive_reason: null,
      inactive_at: null,
      busy: false,
    },
    {
      id: 'r2',
      label: 'Old reader',
      model: 'wisepos',
      serial_last4: null,
      till_id: null,
      default_for_till_ids: [],
      status: null,
      last_seen_at: null,
      is_active: false,
      inactive_reason: 'moved',
      inactive_at: '2026-10-01T10:00:00Z',
      busy: false,
    },
  ],
};

function baseHandler(over: { settings?: unknown; list?: unknown } = {}) {
  return (call: Call) => {
    if (call.path === '/api/venue/pos/settings') return over.settings ?? settings();
    if (call.path.startsWith('/api/venue/pos/readers') && call.method === 'GET') return over.list ?? readerList;
    if (call.path === '/api/venue/pos/tills') return { tills: [{ id: 't1', name: 'Main till', is_active: true }] };
    return {};
  };
}

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <CardReadersScreen />
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

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = baseHandler();
});

it('is for admins and logins with manage_readers only', async () => {
  mockHandler = baseHandler({ settings: settings({ is_admin: false, manage_readers: false }) });
  await show();
  expect(await screen.findByText('For admins')).toBeTruthy();
  expect(mockCalls.some((c) => c.path.startsWith('/api/venue/pos/readers'))).toBe(false);
});

it('lists the readers, asking Stripe for their status when it opens', async () => {
  mockHandler = baseHandler({ settings: settings({ is_admin: false, manage_readers: true }) });
  await show();
  expect(await screen.findByText('Front desk')).toBeTruthy();
  expect(screen.getByText('Ready')).toBeTruthy();
  expect(screen.getByText('Moved away')).toBeTruthy();
  expect(screen.getByText(/Registered to another business on 1 October 2026/)).toBeTruthy();
  expect(screen.getByText(/Stripe stopped selling this reader/)).toBeTruthy();
  expect(screen.getByText('Main till')).toBeTruthy();
  expect(mockCalls.find((c) => c.path.startsWith('/api/venue/pos/readers'))?.path).toBe('/api/venue/pos/readers?refresh=1');
});

it('adds a reader by its pairing code and shows a refusal word for word', async () => {
  await show();
  await screen.findByText('Front desk');
  await press('Add a card reader');
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Pairing code'), 'sepia-cerulean-aqua');
  });
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Name'), 'Back room');
  });
  mockHandler = (call) => {
    if (call.method === 'POST') {
      throw new ApiError("That pairing code didn't work.", 400, {
        error: "That pairing code didn't work. Check the code on the reader's screen and try again. Codes only last a few minutes.",
        code: 'POS_READER_CODE_INVALID',
      });
    }
    return baseHandler()(call);
  };
  await press('Add reader');
  expect(
    screen.getByText("That pairing code didn't work. Check the code on the reader's screen and try again. Codes only last a few minutes."),
  ).toBeTruthy();

  mockHandler = (call) => (call.method === 'POST' ? { reader: { label: 'Back room' }, moved: true } : baseHandler()(call));
  await press('Add reader');
  const post = mockCalls.filter((c) => c.method === 'POST').at(-1)!;
  expect(post.path).toBe('/api/venue/pos/readers');
  expect(post.body).toEqual({ registration_code: 'sepia-cerulean-aqua', label: 'Back room', till_id: 't1' });
  expect(
    screen.getByText('Back room is ready to take payments. It was registered to another account before. Now it takes payments for Studio.'),
  ).toBeTruthy();
});

it('asks before removing an active reader and names a payment in progress', async () => {
  await show();
  await screen.findByText('Front desk');
  mockHandler = (call) => {
    if (call.method === 'DELETE') {
      throw new ApiError('busy', 409, { error: 'A card payment is in progress.', code: 'POS_PAYMENT_IN_PROGRESS' });
    }
    return baseHandler()(call);
  };
  await act(async () => {
    fireEvent.press(screen.getAllByText('Remove')[0]!);
  });
  expect(screen.getByText('Remove Front desk?')).toBeTruthy();
  expect(mockCalls.some((c) => c.method === 'DELETE')).toBe(false);
  const confirm = screen.getAllByText('Remove');
  await act(async () => {
    fireEvent.press(confirm[confirm.length - 1]!);
  });
  expect(mockCalls.find((c) => c.method === 'DELETE')?.path).toBe('/api/venue/pos/readers/r1');
  expect(screen.getByText('A payment is in progress on Front desk. Finish or cancel it first.')).toBeTruthy();
});

it('clears a moved-away reader without asking', async () => {
  await show();
  await screen.findByText('Old reader');
  await act(async () => {
    fireEvent.press(screen.getAllByText('Remove')[1]!);
  });
  expect(mockCalls.find((c) => c.method === 'DELETE')?.path).toBe('/api/venue/pos/readers/r2');
});

it('offers a test reader in test mode, with the simulated code filled in', async () => {
  await show();
  await screen.findByText('Front desk');
  await press('Add a test reader');
  expect(screen.getByDisplayValue('simulated-s700')).toBeTruthy();
});

it('says to connect Stripe first when cards cannot be taken', async () => {
  mockHandler = baseHandler({ list: { readers: [], can_take_cards: false, in_person_payments_enabled: false, test_mode: false } });
  await show();
  expect(await screen.findByText('Connect Stripe in Settings, Payments before adding a card reader.')).toBeTruthy();
  expect(screen.queryByText('Add a card reader')).toBeNull();
});
