/**
 * One online order in the app (POS app step 5, UX spec §8.2, §8.3): the actions its state allows,
 * "Mark ready to collect" asking first, the pickup check opening with a looked-up code, and a push
 * for another business saying so instead of loading anything.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockOpenBrowser = jest.fn((_url: string) => Promise.resolve());
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (url: string) => mockOpenBrowser(url) }));
const mockShare = jest.fn();
jest.mock('@/lib/share/share-binary-file', () => ({ downloadAndShareFile: (args: unknown) => mockShare(args) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  getApiUrl: () => 'https://api.example.test',
  getWebUrl: () => 'https://web.example.test',
}));
let mockParams: Record<string, string> = { id: 'o1' };
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
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
jest.mock('@/components/retail/CameraScanner', () => ({ CameraScanner: () => null, ScanButton: () => null, cameraScanAvailable: false }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useVenue', () => ({ useVenue: () => ({ data: { id: 'venue-1' } }) }));
jest.mock('@/lib/queries/usePos', () => ({ usePosEnabled: () => true }));

const mockWrite = jest.fn();
let mockDetail: unknown = null;
jest.mock('@/lib/queries/useOrders', () => ({
  useShopOrder: () => ({ data: mockDetail, isLoading: false, isRefetching: false, refetch: jest.fn() }),
  useOrderWrite: () => ({ mutateAsync: mockWrite, isPending: false }),
}));

import OrderScreen from './[id]';

function detail(status: string) {
  return {
    order: {
      id: 'o1',
      number: 42,
      fulfilment_type: 'collection',
      fulfilment_status: status,
      pickup_code: 'ACD479',
      delivery_address: null,
      carrier: null,
      tracking_number: null,
      tracking_url: null,
      created_at: '2026-10-09T09:00:00Z',
      subtotal_pence: 3600,
      delivery_pence: 0,
      tax_pence: 600,
      total_pence: 3600,
      paid_pence: 3600,
      refunded_pence: 0,
      contact_name: 'Ana',
      contact_email: 'ana@example.test',
      contact_phone: null,
      marketing_consent: false,
      guest_id: null,
      hold_until: '2026-10-23T09:00:00Z',
      delivery_rate: null,
    },
    lines: [
      { id: 'l1', line_type: 'product', name: 'Shampoo', option_name: null, quantity: 3, total_pence: 3600, refunded_quantity: 0, refunded_pence: 0, track_stock: true },
    ],
    payments: [{ id: 'p1', method: 'online_checkout', status: 'succeeded', amount_pence: 3600, card_brand: 'visa', succeeded_at: '2026-10-09T09:00:00Z' }],
    refunds: [],
    returns: [],
    timeline: [{ at: '2026-10-09T09:00:00Z', action: 'order.placed', summary: 'Placed', actor_name: null, after: null }],
    messages: [],
    return_window_ends: null,
    return_window_closed: false,
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
    settings: { refund_reasons: [], vat_registered: true },
    can: { refund: true, is_admin: false },
  };
}

beforeEach(() => {
  mockWrite.mockReset();
  mockShare.mockReset();
  mockOpenBrowser.mockClear();
  mockToast.error.mockClear();
  mockParams = { id: 'o1' };
});

describe('the packing slip', () => {
  async function pressSlip() {
    await act(async () => {
      fireEvent.press(screen.getByText('Print packing slip'));
    });
  }

  it('downloads the PDF with the Bearer token and opens the share sheet', async () => {
    mockDetail = detail('preparing');
    mockShare.mockResolvedValue({ ok: true });
    await render(<OrderScreen />);
    await pressSlip();
    const args = mockShare.mock.calls[0]![0] as { url: string; filename: string; mimeType: string; headers: Record<string, string> };
    expect(args.url).toMatch(/\/api\/venue\/shop\/orders\/o1\/packing-slip\.pdf$/);
    expect(args.filename).toBe('packing-slip-42.pdf');
    expect(args.mimeType).toBe('application/pdf');
    expect(args.headers.Authorization).toBe('Bearer token-A');
    expect(mockOpenBrowser).not.toHaveBeenCalled();
  });

  it('opens the web page when the server has no PDF route yet (404)', async () => {
    mockDetail = detail('preparing');
    mockShare.mockResolvedValue({ ok: false, message: 'Export failed (404).', status: 404 });
    await render(<OrderScreen />);
    await pressSlip();
    expect(mockOpenBrowser).toHaveBeenCalledWith(expect.stringMatching(/\/dashboard\/orders\/o1\/packing-slip$/));
  });

  it('says so when the download fails', async () => {
    mockDetail = detail('preparing');
    mockShare.mockResolvedValue({ ok: false, message: 'Network request failed' });
    await render(<OrderScreen />);
    await pressSlip();
    expect(mockToast.error).toHaveBeenCalledWith("We couldn't get the packing slip. Check your connection and try again.");
    expect(mockOpenBrowser).not.toHaveBeenCalled();
  });
});

describe('an online order', () => {
  it('offers what a new collection order allows, and asks before marking it ready', async () => {
    mockDetail = detail('new');
    mockWrite.mockResolvedValue({});
    await render(<OrderScreen />);
    expect(screen.getByText('Start preparing')).toBeTruthy();
    expect(screen.getByText('Cancel and refund')).toBeTruthy();
    expect(screen.getByText('Pickup code ACD-479')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getAllByText('Mark ready to collect')[0]!);
    });
    expect(screen.getByText('Mark Order 42 ready to collect?')).toBeTruthy();
    expect(mockWrite).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getAllByText('Mark ready to collect').at(-1)!);
    });
    expect(mockWrite).toHaveBeenCalledWith({ kind: 'status', body: { status: 'ready' } });
  });

  it('opens the pickup check with a looked-up code on a ready order', async () => {
    mockDetail = detail('ready');
    mockParams = { id: 'o1', code: 'ACD479' };
    await render(<OrderScreen />);
    expect(screen.getByText('Check their pickup code')).toBeTruthy();
    expect(screen.getByDisplayValue('ACD479')).toBeTruthy();
  });

  it("says so when a push is for another business's order", async () => {
    mockDetail = detail('new');
    mockParams = { id: 'o1', venue: 'venue-2' };
    await render(<OrderScreen />);
    expect(screen.getByText('This order is at another business. Switch to it in the app, then open it again.')).toBeTruthy();
  });
});
