/**
 * Settings, Gift vouchers in the app (web `GiftVouchersCard`, UX spec §20.9): the gates, the
 * first save sending every field at version 0, later saves sending only what changed, a 412 that
 * loads the fresh settings from its body and keeps the edits, a refusal shown word for word with
 * its field, the terms template, the online sale rule and link, adding an existing voucher and the
 * CSV import stepper.
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
jest.mock('@/components/ui/DatePickerField', () => ({ DatePickerField: () => null }));
jest.mock('@/components/pos/settings-more/LinkShareCard', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LinkShareCard: ({ title, url, qrLabel }: { title: string; url: string; qrLabel: string }) =>
      React.createElement(Text, null, `${title} ${url} ${qrLabel}`),
  };
});
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  getWebUrl: () => 'https://web.example.test',
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/usePos', () => ({
  usePosEnabled: () => true,
  usePosGate: (extra = true) => ({ accessToken: 'token-A', enabled: extra }),
}));
let mockVouchersOn = true;
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({
    data: { feature_flags: { resolved: { pos_enabled: true, pos_gift_vouchers_enabled: mockVouchersOn } } },
  }),
}));
jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: (params: { search?: string }, options: { enabled?: boolean }) => ({
    data:
      options.enabled && params.search === 'sam'
        ? { guests: [{ id: 'g1', first_name: 'Sam', last_name: 'Smith', email: 'sam@example.test', phone: null }] }
        : undefined,
  }),
}));
const mockPick = jest.fn();
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (o: unknown) => mockPick(o) }));
let mockFileText = '';
jest.mock('expo-file-system', () => ({
  File: class {
    text() {
      return Promise.resolve(mockFileText);
    }
  },
}));
const mockShareFile = jest.fn();
jest.mock('@/lib/share/share-text-file', () => ({ shareTextFile: (a: unknown) => mockShareFile(a) }));

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

// eslint-disable-next-line import/first -- after the jest.mock calls, which jest hoists anyway
import GiftVouchersSettingsScreen from './gift-vouchers';

function posSettings(isAdmin = true) {
  return {
    settings: { trading_name: 'Studio Nine', track_stock_enabled: false, version: 4 },
    staff_capability_map: {},
    can: { is_admin: isAdmin, manage_settings: isAdmin, edit_capabilities: false },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
  };
}

function vouchers(over: Record<string, unknown> = {}, venue: Record<string, unknown> = {}) {
  return {
    settings: {
      preset_pence: [2500, 5000],
      custom_allowed: true,
      min_pence: 1000,
      max_pence: 50000,
      expiry_months: 12,
      terms: null,
      online_sale_enabled: false,
      accent_colour: null,
      version: 3,
      set_up: true,
      ...over,
    },
    can: { edit: true },
    venue: { name: 'Studio', currency: 'GBP', card_payments_ready: true, slug: 'studio-nine', ...venue },
  };
}

function route(v: () => unknown, extra?: (call: Call) => unknown) {
  return (call: Call) => {
    const out = extra?.(call);
    if (out !== undefined) return out;
    if (call.path === '/api/venue/pos/settings') return posSettings();
    if (call.path === '/api/venue/pos/voucher-settings') return v();
    return {};
  };
}

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <GiftVouchersSettingsScreen />
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

async function type(label: string, text: string) {
  // The text field, where a group shares its label (the code choice and the code field).
  const field = screen.getAllByLabelText(label).find((el) => typeof el.props.onChangeText === 'function') ?? screen.getByLabelText(label);
  await act(async () => {
    fireEvent.changeText(field, text);
  });
}

async function toggle(label: string, value: boolean) {
  await act(async () => {
    fireEvent(screen.getByLabelText(label), 'valueChange', value);
  });
}

const patches = () => mockCalls.filter((c) => c.method === 'PATCH');

beforeEach(() => {
  mockCalls.length = 0;
  mockVouchersOn = true;
  mockToast.success.mockClear();
  mockPick.mockReset();
  mockShareFile.mockReset();
});

describe('gates', () => {
  it('says gift vouchers are switched off, and never loads their settings', async () => {
    mockVouchersOn = false;
    mockHandler = route(() => vouchers());
    await show();
    expect(await screen.findByText('Gift vouchers is switched off')).toBeTruthy();
    expect(mockCalls.some((c) => c.path === '/api/venue/pos/voucher-settings')).toBe(false);
  });

  it('is for admins only, as the web card is', async () => {
    mockHandler = (call) => (call.path === '/api/venue/pos/settings' ? posSettings(false) : vouchers());
    await show();
    expect(await screen.findByText('For admins')).toBeTruthy();
    expect(mockCalls.some((c) => c.path === '/api/venue/pos/voucher-settings')).toBe(false);
  });
});

describe('saving', () => {
  it('before set-up, says so and the first save sends every field at version 0', async () => {
    mockHandler = route(
      () => vouchers({ set_up: false, version: 0 }),
      (call) => (call.method === 'PATCH' ? vouchers({ set_up: true, version: 1 }) : undefined),
    );
    await show();
    expect(await screen.findByText(/Gift vouchers are ready to set up/)).toBeTruthy();
    expect(screen.queryByText('Add an existing voucher')).toBeNull();
    await press('Save changes');
    expect(patches()[0]?.body).toEqual({
      preset_pence: [2500, 5000],
      custom_allowed: true,
      min_pence: 1000,
      max_pence: 50000,
      expiry_months: 12,
      terms: null,
      online_sale_enabled: false,
      accent_colour: null,
      version: 0,
    });
    expect(mockToast.success).toHaveBeenCalledWith('Gift voucher settings saved.');
    expect(screen.getByText('Add an existing voucher')).toBeTruthy();
    expect(screen.getByText('Import vouchers from a file')).toBeTruthy();
  });

  it('once set up, sends only what changed with the loaded version', async () => {
    mockHandler = route(
      () => vouchers(),
      (call) => (call.method === 'PATCH' ? vouchers({ custom_allowed: false, version: 4 }) : undefined),
    );
    await show();
    await screen.findByText('Amounts to offer');
    await toggle('Another amount', false);
    await type('Add an amount', '75');
    await press('Add an amount');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Remove £25'));
    });
    await press('Save changes');
    expect(patches()[0]?.body).toEqual({ preset_pence: [5000, 7500], custom_allowed: false, version: 3 });
  });

  it('on a 412 loads the fresh settings from the body and keeps the edits beside them', async () => {
    mockHandler = route(
      () => vouchers(),
      (call) => {
        if (call.method !== 'PATCH') return undefined;
        throw new ApiError('stale', 412, { error: 'stale', code: 'POS_SETTINGS_STALE', settings: vouchers({ max_pence: 20000, version: 9 }).settings });
      },
    );
    await show();
    await screen.findByText('Amounts to offer');
    await toggle('Another amount', false);
    await press('Save changes');
    expect(screen.getByText(/Someone else changed these settings while you were editing/)).toBeTruthy();
    expect(screen.getByText('Use their changes')).toBeTruthy();
    expect(screen.getByLabelText('Largest amount').props.value).toBe('200.00');
    expect(screen.getByLabelText('Another amount').props.value).toBe(false);
    mockHandler = route(() => vouchers(), (call) => (call.method === 'PATCH' ? vouchers({ version: 10 }) : undefined));
    await press('Save changes');
    expect(patches()[1]?.body).toEqual({ custom_allowed: false, version: 9 });
  });

  it('shows a refusal word for word, with the field it names', async () => {
    const sentence = 'The smallest amount must be less than the largest.';
    mockHandler = route(
      () => vouchers(),
      (call) => {
        if (call.method !== 'PATCH') return undefined;
        throw new ApiError(sentence, 400, { error: sentence, code: 'VALIDATION_FAILED', fields: [{ path: 'min_pence', message: sentence }] });
      },
    );
    await show();
    await screen.findByText('Amounts to offer');
    await type('Smallest amount', '900');
    await press('Save changes');
    expect(screen.getAllByText(sentence)).toHaveLength(2);
    expect(patches()[0]?.body).toEqual({ min_pence: 90000, version: 3 });
  });

  it('will not send an emptied months field, which would mean never', async () => {
    mockHandler = route(() => vouchers());
    await show();
    await screen.findByText('Amounts to offer');
    await type('Months', '');
    await press('Save changes');
    expect(screen.getByText('Choose at least 1 month.')).toBeTruthy();
    expect(patches()).toHaveLength(0);
  });
});

describe('terms and online sale', () => {
  it('fills the template, and asks before replacing written terms', async () => {
    mockHandler = route(() => vouchers());
    await show();
    await screen.findByText('Amounts to offer');
    await press('Start from our template');
    expect(screen.getByLabelText('Your voucher terms').props.value).toMatch(/^Gift vouchers at Studio Nine/);
    expect(screen.getByLabelText('Your voucher terms').props.value).toContain('12 months after it was bought');
    await type('Your voucher terms', 'Our own terms');
    await press('Start from our template');
    expect(screen.getByText('Replace your voucher terms?')).toBeTruthy();
    await press('Use the template');
    expect(screen.getByLabelText('Your voucher terms').props.value).toMatch(/^Gift vouchers at Studio Nine/);
  });

  it('needs terms and card payments to sell online, and links the page once saved on', async () => {
    mockHandler = route(() => vouchers());
    await show();
    await screen.findByText('Amounts to offer');
    expect(screen.getByText('To sell online, write your voucher terms and set up card payments first.')).toBeTruthy();
    expect(screen.getByLabelText('Sell gift vouchers online').props.disabled).toBe(true);
    expect(screen.queryByText(/Your gift voucher page/)).toBeNull();
  });

  it('shows the public page link with the QR words when online sale is on', async () => {
    mockHandler = route(() => vouchers({ terms: 'Terms', online_sale_enabled: true }));
    await show();
    expect(
      await screen.findByText('Your gift voucher page https://web.example.test/vouchers/studio-nine Download QR code'),
    ).toBeTruthy();
  });
});

describe('adding an existing voucher', () => {
  it('sends the voucher with a request id, links a client and shows a new code once', async () => {
    mockHandler = route(
      () => vouchers(),
      (call) =>
        call.path === '/api/venue/pos/vouchers'
          ? { voucher: { id: 'v1', code_last4: '9HPA', balance_pence: 2000 }, code: '7K4Q-M2XD-9HPA' }
          : undefined,
    );
    await show();
    await screen.findByText('Amounts to offer');
    await press('Add an existing voucher');
    await press('Give it a new ResNeo code');
    await type('Amount left on it', '20');
    await type('Link to a client (optional)', 'sam');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    await press('Sam Smith');
    await press('No expiry date');
    await press('Add voucher');
    const body = mockCalls.find((c) => c.path === '/api/venue/pos/vouchers')?.body as Record<string, unknown>;
    expect(body).toMatchObject({ kind: 'existing_voucher', balance_pence: 2000, expires_on: null, guest_id: 'g1' });
    expect(body.code).toBeUndefined();
    expect(typeof body.client_request_id).toBe('string');
    expect(screen.getByText('Gift voucher ending 9HPA added, with £20.00 on it.')).toBeTruthy();
    expect(screen.getByText('7K4Q-M2XD-9HPA')).toBeTruthy();
  });

  it('says when the code is already used, and a new attempt gets a new request id', async () => {
    const taken = 'Another voucher already uses that code.';
    mockHandler = route(
      () => vouchers(),
      (call) => {
        if (call.path !== '/api/venue/pos/vouchers') return undefined;
        throw new ApiError(taken, 409, { error: taken, code: 'POS_NAME_TAKEN' });
      },
    );
    await show();
    await screen.findByText('Amounts to offer');
    await press('Add an existing voucher');
    await type('Voucher code', 'ab12cd34');
    await type('Amount left on it', '15');
    await press('Add voucher');
    await press('Add voucher');
    expect(screen.getByText(taken)).toBeTruthy();
    const sent = mockCalls.filter((c) => c.path === '/api/venue/pos/vouchers').map((c) => c.body as Record<string, unknown>);
    expect(sent[0]).toMatchObject({ code: 'AB12CD34', balance_pence: 1500 });
    expect(sent[0]?.client_request_id).not.toBe(sent[1]?.client_request_id);
  });
});

describe('importing vouchers', () => {
  it('reads the file, guesses the columns, checks, imports and offers the new codes once', async () => {
    mockFileText = 'Voucher number,Amount left,"Holder\'s email","Holder\'s name"\r\nAB12,25.00,a@b.c,Ann\r\n';
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///v.csv', name: 'v.csv', size: 100 }] });
    mockShareFile.mockResolvedValue({ ok: true });
    const result = (dry: boolean) => ({
      dry_run: dry,
      rows: [{ row: 2, status: 'new', problem: null, balance_pence: 2500 }],
      summary: { count: 1, amount_pence: 2500, exists: 0, problems: 0 },
      codes: dry ? [] : [{ row: 2, code: 'AAAA-BBBB-CCCC', last4: 'CCCC' }],
    });
    mockHandler = route(
      () => vouchers(),
      (call) => (call.path === '/api/venue/pos/vouchers/import' ? result((call.body as { dry_run: boolean }).dry_run) : undefined),
    );
    await show();
    await screen.findByText('Amounts to offer');
    await press('Import vouchers from a file');
    await press('Choose a CSV file');
    await press('Check the file');
    const dry = mockCalls.find((c) => c.path === '/api/venue/pos/vouchers/import')?.body;
    expect(dry).toEqual({
      csv: mockFileText,
      dry_run: true,
      new_codes: false,
      columns: { code: 'Voucher number', balance: 'Amount left', holder_email: "Holder's email", holder_name: "Holder's name" },
    });
    expect(screen.getByText('1 vouchers to add, worth £25.00 in total. 0 rows have problems.')).toBeTruthy();
    expect(screen.getByText('Will be added')).toBeTruthy();
    await press('Give every voucher a new ResNeo code');
    const last = mockCalls.filter((c) => c.path === '/api/venue/pos/vouchers/import').at(-1)?.body as { new_codes: boolean; dry_run: boolean };
    expect(last).toMatchObject({ dry_run: true, new_codes: true });
    await press('Import vouchers');
    expect(screen.getByText('1 vouchers added, worth £25.00 in total.')).toBeTruthy();
    await press('Done');
    expect(screen.getAllByText('Download the new codes. You can only do this once.').length).toBe(2);
    await act(async () => {
      fireEvent.press(screen.getAllByText('Download the new codes. You can only do this once.').at(-1)!);
    });
    expect(mockShareFile).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'new-voucher-codes.csv', body: 'Row,Code,Ending\r\n2,AAAA-BBBB-CCCC,CCCC\r\n' }),
    );
  });

  it('refuses a file over 5 MB', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///big.csv', name: 'big.csv', size: 6 * 1024 * 1024 }] });
    mockHandler = route(() => vouchers());
    await show();
    await screen.findByText('Amounts to offer');
    await press('Import vouchers from a file');
    await press('Choose a CSV file');
    expect(screen.getByText('The file is larger than 5 MB.')).toBeTruthy();
  });
});
