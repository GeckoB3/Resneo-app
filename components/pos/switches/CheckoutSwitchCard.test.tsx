/**
 * The Checkout switch in Booking settings (the web's CheckoutSwitchSection test, case for case):
 * switching on through the one confirmation (with the seller's tick) and on to the set-up wizard,
 * switching off through the sheet that says what is left, the reasons it cannot come on, ResNeo
 * managing it, and nothing at all for a venue ResNeo has not offered Checkout to (gate G0).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { CheckoutSwitchCard } from '@/components/pos/switches/CheckoutSwitchCard';
import { bookingSettingsSwitch } from '@/lib/pos/switches/model';
import { onResponse, switchesResponse } from '@/lib/pos/switches/test-fixtures';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, { testID: 'sheet' }, children) : null,
  };
});
jest.mock('@/components/ui/Skeleton', () => ({ Skeleton: () => null }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: { id: 'venue-1', name: 'Bloom Hair Studio', timezone: 'Europe/London' },
    terminology: { client: 'client', booking: 'appointment', staff: 'staff' },
  }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
let mockSwitches: unknown;
let mockLoading = false;
const mockMutate = jest.fn();
const mockApply = jest.fn();
jest.mock('@/lib/queries/useFeatureSwitches', () => ({
  useFeatureSwitches: () => ({ data: mockSwitches, isLoading: mockLoading, isFetching: false, isError: false, refetch: jest.fn() }),
  useSetFeatureSwitch: () => ({ mutateAsync: mockMutate, isPending: false }),
  applySwitchResult: (...args: unknown[]) => mockApply(...args),
  downloadVouchersList: jest.fn(),
}));
jest.mock('@/lib/queries/usePos', () => ({ useVoucherSettings: () => ({ data: undefined }) }));

const USE = 'Use Checkout';

async function show() {
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <CheckoutSwitchCard />
    </QueryClientProvider>,
  );
}

function toggle() {
  return screen.getByLabelText(USE);
}

beforeEach(() => {
  mockPush.mockReset();
  mockMutate.mockReset();
  mockApply.mockReset();
  mockToast.success.mockClear();
  mockLoading = false;
  mockSwitches = switchesResponse();
});

describe('Checkout switch in Booking settings', () => {
  it('shows nothing for a venue ResNeo has not offered Checkout to', async () => {
    mockSwitches = switchesResponse({ switches: { pos_enabled: { offered: false, can_switch_on: false, unavailable_reason: 'not_offered' } } });
    await show();
    expect(screen.queryByLabelText(USE)).toBeNull();
    expect(screen.queryByText('Take payments at your desk')).toBeNull();
  });

  it('shows nothing while the switches cannot be read, and a placeholder while they load', async () => {
    mockSwitches = undefined;
    await show();
    expect(screen.queryByLabelText(USE)).toBeNull();

    mockLoading = true;
    await show();
    expect(screen.getByTestId('checkout-switch-loading')).toBeTruthy();
  });

  it('switches Checkout on through the confirmation, with the seller tick box, then opens set-up', async () => {
    const after = onResponse();
    mockMutate.mockResolvedValue({ ok: true, switches: after });
    await show();
    expect(screen.getByText('Checkout')).toBeTruthy();
    expect(screen.getByText('Take payments at your desk')).toBeTruthy();
    expect(screen.getByText(/^Check clients out in two taps, take cash or cards/)).toBeTruthy();
    expect(toggle().props.value).toBe(false);
    expect(screen.getByText(/^Switching on asks you to confirm, then helps you set it up\./)).toBeTruthy();
    await act(async () => {
      fireEvent(toggle(), 'valueChange', true);
    });
    expect(screen.getByText('Switch on Checkout for Bloom Hair Studio?')).toBeTruthy();
    // No extras from here: the seller's tick, then Checkout alone.
    expect(screen.queryByText(/so we'll switch that on too/)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on and set up'));
    });
    expect(mockMutate).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/I understand that Bloom Hair Studio is the seller/));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on and set up'));
    });
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({
      feature: 'pos_enabled',
      on: true,
      acknowledge_terms_version: '2026-10-11',
      client_request_id: expect.any(String),
      version: 1,
    });
    // The venue and the POS bootstrap follow at once, then on to the wizard's welcome.
    expect(mockApply).toHaveBeenCalledWith(expect.anything(), 'token-A', after);
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/welcome');
  });

  it('says who switched it on, points to Checkout settings for the extras, and switches off through the sheet', async () => {
    mockSwitches = onResponse();
    mockMutate.mockResolvedValue({ ok: true, switches: switchesResponse({ terms_accepted: true }) });
    await show();
    expect(toggle().props.value).toBe(true);
    expect(screen.getByText(/^Switched on by Sam Taylor on 11 October/)).toBeTruthy();
    expect(
      screen.getByText('Gift vouchers, the loyalty card, the online shop and the rest of Checkout are set up in Checkout settings.'),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Open Checkout settings'));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout-settings');
    mockPush.mockReset();

    await act(async () => {
      fireEvent(toggle(), 'valueChange', false);
    });
    expect(screen.getByText('Switch off Checkout?')).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByText('Switch off'));
    });
    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ feature: 'pos_enabled', on: false }));
    expect(mockToast.success).toHaveBeenCalledWith(
      'Checkout is off. Nothing is deleted, and you can switch it back on whenever you like.',
    );
    // It stays on Booking settings.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('says where past sales are when something is left to finish', async () => {
    mockSwitches = onResponse({ in_use: { till_open: true } });
    mockMutate.mockResolvedValue({ ok: true, switches: switchesResponse({ terms_accepted: true }) });
    await show();
    await act(async () => {
      fireEvent(toggle(), 'valueChange', false);
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Switch off'));
    });
    expect(mockToast.success).toHaveBeenCalledWith('Checkout is off. Your past sales are in Sales history, in your menu.');
  });

  it('falls back to "Checkout is on" when nobody is named', async () => {
    mockSwitches = onResponse({ switches: { pos_enabled: { set_by_name: null } } });
    await show();
    expect(screen.getByText('Checkout is on')).toBeTruthy();
  });

  it('explains why it cannot come on, with a way to the plan, and the switch stays off', async () => {
    mockSwitches = switchesResponse({ switches: { pos_enabled: { can_switch_on: false, unavailable_reason: 'billing' } } });
    await show();
    expect(toggle().props.disabled).toBe(true);
    expect(screen.getByTestId('checkout-switch-note')).toBeTruthy();
    expect(screen.getByText(/^Your plan needs attention\./)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Open Plan & payments'));
    });
    expect(mockPush).toHaveBeenCalledWith('/manage/plan');
  });

  it('shows a pause by ResNeo with its reason', async () => {
    mockSwitches = switchesResponse({
      switches: {
        pos_enabled: { can_switch_on: false, platform_state: 'blocked', public_reason: 'We are checking your Stripe account.', unavailable_reason: 'blocked' },
      },
    });
    await show();
    expect(toggle().props.disabled).toBe(true);
    expect(screen.getByText(/We are checking your Stripe account\./)).toBeTruthy();
    expect(screen.queryByText('Open Plan & payments')).toBeNull();
  });

  it('reads Checkout as on, with no switch to move, while ResNeo manages it', async () => {
    mockSwitches = onResponse({ switches: { pos_enabled: { offered: false } } });
    await show();
    expect(toggle().props.value).toBe(true);
    expect(toggle().props.disabled).toBe(true);
    expect(
      screen.getByText('ResNeo manages Checkout for Bloom Hair Studio at the moment. Contact ResNeo support to change it.'),
    ).toBeTruthy();
  });
});

describe('bookingSettingsSwitch', () => {
  it('says Checkout is paused for everyone while the environment switch is set', () => {
    const card = bookingSettingsSwitch(
      switchesResponse({ environment_off: true, switches: { pos_enabled: { can_switch_on: false, unavailable_reason: 'environment' } } }),
      'Bloom',
    );
    expect(card).toMatchObject({ on: false, canToggle: false, billingLink: false });
    expect(card?.note).toBe('Checkout is paused for everyone for a short while. Please try again later.');
  });

  it('lets an admin switch off even when it could not come back on', () => {
    const card = bookingSettingsSwitch(onResponse({ switches: { pos_enabled: { can_switch_on: false, unavailable_reason: 'billing' } } }), 'Bloom');
    expect(card).toMatchObject({ on: true, canToggle: true, note: null, billingLink: false });
  });
});
