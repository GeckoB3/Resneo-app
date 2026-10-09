/**
 * Checkout and online shop messages on the Communications screen (web `PosMessageSwitchesBlock`,
 * plan §4.23): nothing without Checkout, the voucher reminder only with vouchers, and the shop's
 * two optional messages, saved at once to the shop's own settings at the loaded version, only with
 * the shop on. A 412 shows the web's sentence and loads the fresh settings.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ApiError } from '@/lib/api/client';
import { defaultPosMessageSwitches } from '@/lib/communications/pos-message-switches';

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

import { PosMessageSwitchesCard } from './PosMessageSwitchesCard';

function shopView(settings: Record<string, unknown>) {
  return {
    settings: { version: 4, shop_delivered_email_enabled: false, shop_ready_sms_enabled: false, ...settings },
    zones: [],
    readiness: { checks: {}, canOpen: false, open: false },
  };
}

async function renderCard(ui: ReactElement) {
  // gcTime Infinity schedules no garbage-collection timer, so a single-file run exits.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}

/** The shop's switches stay disabled until its settings load. */
async function shopLoaded() {
  await waitFor(() => expect(screen.getByLabelText('Order delivered').props.disabled).toBeFalsy());
}

async function toggle(label: string, value: boolean) {
  await act(async () => {
    fireEvent(screen.getByLabelText(label), 'valueChange', value);
  });
}

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = () => shopView({});
});

describe('PosMessageSwitchesCard', () => {
  it('shows nothing while Checkout is off', async () => {
    await renderCard(
      <PosMessageSwitchesCard features={{ pos: false, vouchers: true, shop: true }} switches={null} isAdmin onToggle={() => {}} />,
    );
    expect(screen.queryByText('Checkout messages')).toBeNull();
    expect(mockCalls).toHaveLength(0);
  });

  it('switches a receipt off, and hides the voucher reminder and shop without them', async () => {
    const onToggle = jest.fn();
    await renderCard(
      <PosMessageSwitchesCard
        features={{ pos: true, vouchers: false, shop: false }}
        switches={{ ...defaultPosMessageSwitches(), pos_refund_receipt: { enabled: false } }}
        isAdmin
        onToggle={onToggle}
      />,
    );
    expect(screen.getByText('Messages sent to clients after a sale. Switch one off to stop it going automatically.')).toBeTruthy();
    expect(screen.queryByText('Gift voucher expiry reminder')).toBeNull();
    expect(screen.queryByText('Online shop messages')).toBeNull();
    expect(screen.getByLabelText('Refund receipt').props.value).toBe(false);
    expect(screen.getByLabelText('Sale receipt').props.value).toBe(true);
    await toggle('Sale receipt', false);
    expect(onToggle).toHaveBeenCalledWith('pos_sale_receipt', false);
    expect(mockCalls).toHaveLength(0);
  });

  it("saves the shop's optional messages to the shop's settings with their version", async () => {
    mockHandler = (call) => shopView({ shop_delivered_email_enabled: call.method === 'PATCH', version: call.method === 'PATCH' ? 5 : 4 });
    await renderCard(
      <PosMessageSwitchesCard features={{ pos: true, vouchers: true, shop: true }} switches={null} isAdmin onToggle={() => {}} />,
    );
    expect(screen.getByText('Gift voucher expiry reminder')).toBeTruthy();
    expect(screen.getByText('Online shop messages')).toBeTruthy();
    await shopLoaded();
    expect(screen.getByLabelText('Order delivered').props.value).toBe(false);
    await toggle('Order delivered', true);
    expect(mockCalls.find((c) => c.method === 'PATCH')).toEqual({
      path: '/api/venue/shop/settings',
      method: 'PATCH',
      body: { version: 4, shop_delivered_email_enabled: true },
    });
    expect(screen.getByLabelText('Order delivered').props.value).toBe(true);
  });

  it("on a 412 says someone else changed the shop settings and shows theirs", async () => {
    mockHandler = (call) => {
      if (call.method === 'PATCH') {
        throw new ApiError('Stale', 412, { error: 'Stale', code: 'POS_SETTINGS_STALE', ...shopView({ version: 9, shop_ready_sms_enabled: true }) });
      }
      return shopView({});
    };
    await renderCard(
      <PosMessageSwitchesCard features={{ pos: true, vouchers: false, shop: true }} switches={null} isAdmin onToggle={() => {}} />,
    );
    await shopLoaded();
    await toggle('Order delivered', true);
    expect(
      screen.getByText("Someone else changed the shop settings while you were here. We've loaded their changes. Try again."),
    ).toBeTruthy();
    expect(screen.getByLabelText('Order delivered').props.value).toBe(false);
    expect(screen.getByLabelText('Ready to collect text').props.value).toBe(true);
  });

  it('does not load the shop settings for a login that is not an admin', async () => {
    await renderCard(
      <PosMessageSwitchesCard features={{ pos: true, vouchers: false, shop: true }} switches={null} isAdmin={false} onToggle={() => {}} />,
    );
    expect(mockCalls).toHaveLength(0);
    expect(screen.getByLabelText('Order delivered').props.disabled).toBe(true);
    expect(screen.getByLabelText('Sale receipt').props.disabled).toBe(true);
  });
});
