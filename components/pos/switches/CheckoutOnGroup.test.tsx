/**
 * "Checkout is on" in Checkout settings and switching off (POS Part 5, design section 14 steps 6
 * and 7; A5, A6): who switched it on, the welcome line after switching on, the three extras (on,
 * off, paused by ResNeo), switching an extra on, the off sheets with their refusals, warnings with
 * counts and the vouchers tick, the history, and nothing at all from a server without the route.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { CheckoutOnGroup, SwitchOffCheckout } from '@/components/pos/switches/CheckoutOnGroup';
import { ApiError } from '@/lib/api/client';
import { onResponse } from '@/lib/pos/switches/test-fixtures';
import type { PosSwitchExtraKey } from '@/types/pos-switches';

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
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'client', booking: 'appointment', staff: 'staff' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
let mockSwitches: unknown;
const mockMutate = jest.fn();
const mockDownload = jest.fn();
jest.mock('@/lib/queries/useFeatureSwitches', () => ({
  useFeatureSwitches: () => ({ data: mockSwitches, isLoading: false, isFetching: false, isError: false, refetch: jest.fn() }),
  useSetFeatureSwitch: () => ({ mutateAsync: mockMutate, isPending: false }),
  downloadVouchersList: (...args: unknown[]) => mockDownload(...args),
}));
// Switching gift vouchers off says so when they are on sale online (the voucher settings' answer).
let mockOnlineSale = false;
jest.mock('@/lib/queries/usePos', () => ({
  useVoucherSettings: () => ({ data: { settings: { online_sale_enabled: mockOnlineSale } } }),
}));

async function group(props: { welcome?: boolean; missed?: PosSwitchExtraKey[] } = {}) {
  await render(<CheckoutOnGroup welcome={props.welcome ?? false} missed={props.missed ?? []} timeZone="Europe/London" venueName="Bloom" />);
}

beforeEach(() => {
  mockPush.mockReset();
  mockMutate.mockReset();
  mockDownload.mockReset();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockOnlineSale = false;
  mockSwitches = onResponse({
    switches: {
      pos_gift_vouchers_enabled: { effective: true, venue_choice: true, can_switch_on: false, version: 3 },
      pos_loyalty_enabled: { version: 5 },
    },
  });
});

describe('Checkout is on', () => {
  it('says who switched it on, and welcomes the admin just after switching on', async () => {
    await group({ welcome: true });
    expect(screen.getByText('Checkout is on')).toBeTruthy();
    expect(screen.getByText(/^Switched on by Sam Taylor on \d+ October/)).toBeTruthy();
    expect(screen.getByText("Checkout is on. Let's get it ready.")).toBeTruthy();
  });

  it('names an extra that did not come on', async () => {
    await group({ missed: ['pos_loyalty_enabled'] });
    expect(screen.getByText("Checkout is on, but we couldn't switch on loyalty card. You can try again below.")).toBeTruthy();
  });

  it('shows nothing when the switches cannot be read (an older server)', async () => {
    mockSwitches = undefined;
    await group();
    expect(screen.queryByText('Checkout is on')).toBeNull();
    await render(<SwitchOffCheckout timeZone="Europe/London" />);
    expect(screen.queryByText('Switch off Checkout')).toBeNull();
  });
});

describe('the extras', () => {
  it('lists each extra on, off or paused, leaving out one not offered', async () => {
    mockSwitches = onResponse({
      switches: {
        pos_gift_vouchers_enabled: { effective: true, venue_choice: true, can_switch_on: false },
        pos_loyalty_enabled: { platform_state: 'blocked', venue_choice: true, public_reason: 'We are looking at it.', can_switch_on: false },
      },
    });
    await group();
    expect(screen.getByText('Gift vouchers')).toBeTruthy();
    expect(screen.getByText('Paused by ResNeo')).toBeTruthy();
    expect(screen.getByText('We are looking at it.')).toBeTruthy();
    expect(screen.queryByText('Online shop')).toBeNull();
    expect(screen.getByLabelText('Loyalty card').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('switches an extra on with its version', async () => {
    mockMutate.mockResolvedValue({ ok: true, switches: mockSwitches });
    await group();
    await act(async () => {
      fireEvent(screen.getByLabelText('Loyalty card'), 'valueChange', true);
    });
    expect(mockMutate).toHaveBeenCalledWith({ feature: 'pos_loyalty_enabled', on: true, client_request_id: expect.any(String), version: 5 });
    expect(mockToast.success).toHaveBeenCalledWith('Loyalty card switched on.');
  });

  it('says why an extra did not come on', async () => {
    mockMutate.mockRejectedValue(new ApiError('No', 409, { error: 'No', code: 'SWITCH_NOT_AVAILABLE', reason: 'billing' }));
    await group();
    await act(async () => {
      fireEvent(screen.getByLabelText('Loyalty card'), 'valueChange', true);
    });
    expect(screen.getByText(/Your plan needs attention/)).toBeTruthy();
  });

  it("opens an extra's set-up from under its switch", async () => {
    await group();
    await act(async () => {
      fireEvent.press(screen.getByText('Settings'));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout-settings/gift-vouchers');
  });

  it('asks before switching gift vouchers off, with the tick while clients hold money on them', async () => {
    mockSwitches = onResponse({
      switches: { pos_gift_vouchers_enabled: { effective: true, venue_choice: true, can_switch_on: false, version: 3 } },
      in_use: { stored_value_count: 2, stored_value_outstanding_pence: 4200 },
    });
    mockMutate.mockResolvedValue({ ok: true, switches: mockSwitches });
    mockDownload.mockResolvedValue({ ok: true });
    await group();
    await act(async () => {
      fireEvent(screen.getByLabelText('Gift vouchers'), 'valueChange', false);
    });
    expect(screen.getByText('Switch off gift vouchers?')).toBeTruthy();
    expect(screen.getByText(/^You won't be able to sell gift vouchers at your desk, in the app or online\./)).toBeTruthy();
    // Not on sale online, so the voucher page line is not said.
    expect(screen.queryByText("Your voucher page will say vouchers aren't on sale.")).toBeNull();
    expect(screen.getByText(/Your clients hold £42\.00 of gift vouchers and credit\. They can still use them at Checkout/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Download the list'));
    });
    expect(mockDownload).toHaveBeenCalledWith('token-A', 'Download the list');
    await act(async () => {
      fireEvent.press(screen.getByText('Switch off'));
    });
    expect(mockMutate).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("We'll still honour these gift vouchers."));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Switch off'));
    });
    expect(mockMutate).toHaveBeenCalledWith({
      feature: 'pos_gift_vouchers_enabled',
      on: false,
      acknowledge: ['stored_value_outstanding'],
      client_request_id: expect.any(String),
      version: 3,
    });
    expect(mockToast.success).toHaveBeenCalledWith('Gift vouchers switched off.');
  });

  it('offers to pause the loyalty card instead while rewards wait', async () => {
    mockSwitches = onResponse({
      switches: { pos_loyalty_enabled: { effective: true, venue_choice: true, can_switch_on: false } },
      in_use: { rewards_waiting: 3 },
    });
    await group();
    await act(async () => {
      fireEvent(screen.getByLabelText('Loyalty card'), 'valueChange', false);
    });
    expect(screen.getByText("3 clients have a loyalty reward waiting. They're kept for if you switch back on.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Pause the loyalty card instead'));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout-settings/loyalty');
  });

  it("says the voucher page will stop selling, when vouchers are on sale online", async () => {
    mockOnlineSale = true;
    mockSwitches = onResponse({ switches: { pos_gift_vouchers_enabled: { effective: true, venue_choice: true, can_switch_on: false } } });
    await group();
    await act(async () => {
      fireEvent(screen.getByLabelText('Gift vouchers'), 'valueChange', false);
    });
    expect(screen.getByText("Your voucher page will say vouchers aren't on sale.")).toBeTruthy();
  });

  it('offers closing the shop for a break instead', async () => {
    mockSwitches = onResponse({
      switches: { pos_online_shop_enabled: { effective: true, venue_choice: true, can_switch_on: false } },
      in_use: { unfinished_orders: 1 },
    });
    await group();
    await act(async () => {
      fireEvent(screen.getByLabelText('Online shop'), 'valueChange', false);
    });
    expect(screen.getByText('Switch off the online shop?')).toBeTruthy();
    expect(screen.getByText('1 online order still needs handing over or sending. You can still do that from Orders.')).toBeTruthy();
    expect(screen.getByText('Just need a break? Close your shop in the Online shop settings instead.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Open Online shop settings'));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout-settings/shop');
  });
});

describe('the history', () => {
  it('lists the changes on request', async () => {
    mockSwitches = onResponse({
      history: [
        {
          id: 'h2',
          feature: 'pos_gift_vouchers_enabled',
          action: 'on',
          layer: 'venue',
          actor_name: 'Sam',
          by_resneo: false,
          public_reason: null,
          created_at: '2026-10-11T09:05:00Z',
        },
        { id: 'h1', feature: 'pos_enabled', action: 'on', layer: 'platform', actor_name: null, by_resneo: true, public_reason: null, created_at: '2026-10-11T09:04:00Z' },
      ],
    });
    await group();
    expect(screen.queryByText('Gift vouchers switched on by Sam')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('History'));
    });
    expect(screen.getByText('Gift vouchers switched on by Sam')).toBeTruthy();
    expect(screen.getByText('Checkout switched on by ResNeo')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Hide history'));
    });
    expect(screen.queryByText('Checkout switched on by ResNeo')).toBeNull();
  });

  it('says when there is nothing yet', async () => {
    await group();
    await act(async () => {
      fireEvent.press(screen.getByText('History'));
    });
    expect(screen.getByText('Nothing has changed yet.')).toBeTruthy();
  });
});

describe('switching Checkout off', () => {
  async function openOff() {
    await render(<SwitchOffCheckout timeZone="Europe/London" />);
    await act(async () => {
      fireEvent.press(screen.getByText('Switch off Checkout'));
    });
  }

  it('is refused while money is moving, naming the sale with a link', async () => {
    mockSwitches = onResponse({ in_use: { blocking: [{ kind: 'sale_waiting_on_phone', sale_id: 'sale-9', sale_number: 1043 }] } });
    await openOff();
    expect(screen.getByText('Switch off Checkout?')).toBeTruthy();
    expect(screen.getByText('Sale 1043 is waiting for a phone to take the card. Cancel it first.')).toBeTruthy();
    expect(screen.getByLabelText('Switch off').props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      fireEvent.press(screen.getByText('Open sale 1043'));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout/sale-9');
  });

  it('warns with counts, needs the vouchers tick, and says where past sales are', async () => {
    mockSwitches = onResponse({
      in_use: { till_open: true, open_sales: 3, unfinished_orders: 2, stored_value_count: 4, stored_value_outstanding_pence: 42000 },
    });
    mockMutate.mockResolvedValue({ ok: true, switches: mockSwitches });
    await openOff();
    expect(screen.getByText('Your till is still open. Close it and count the cash first.')).toBeTruthy();
    expect(screen.getByText("3 sales are still open. They'll be waiting if you switch Checkout back on.")).toBeTruthy();
    expect(screen.getByText('2 online orders still need handing over or sending. You can still do that from Orders.')).toBeTruthy();
    expect(screen.getByText('Your clients hold £420.00 of gift vouchers and credit. You still have to accept them, even with Checkout off.')).toBeTruthy();
    // The web's links beside the warnings.
    expect(screen.getByText('Open the till')).toBeTruthy();
    expect(screen.getByText('Open Orders')).toBeTruthy();
    expect(screen.getByLabelText('Switch off').props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("We'll still honour these gift vouchers."));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Switch off'));
    });
    expect(mockMutate).toHaveBeenCalledWith({
      feature: 'pos_enabled',
      on: false,
      acknowledge: ['stored_value_outstanding'],
      client_request_id: expect.any(String),
      version: 2,
    });
    expect(mockToast.success).toHaveBeenCalledWith('Checkout is off. Your past sales are in Sales history, in your menu.');
  });

  it('goes straight off when nothing is in use', async () => {
    mockMutate.mockResolvedValue({ ok: true, switches: mockSwitches });
    await openOff();
    await act(async () => {
      fireEvent.press(screen.getByText('Switch off'));
    });
    expect(mockMutate.mock.calls[0][0]).not.toHaveProperty('acknowledge');
    expect(mockToast.success).toHaveBeenCalledWith(
      'Checkout is off. Nothing is deleted, and you can switch it back on whenever you like.',
    );
  });

  it('names the sale at once when a payment started in the meantime', async () => {
    mockMutate.mockRejectedValue(
      new ApiError('In use', 409, { error: 'In use', code: 'SWITCH_IN_USE', blocking: [{ kind: 'card_payment_in_progress', sale_id: 's', sale_number: 7 }] }),
    );
    await openOff();
    await act(async () => {
      fireEvent.press(screen.getByText('Switch off'));
    });
    expect(screen.getByText('A card payment is in progress on sale 7. Finish or cancel it first.')).toBeTruthy();
    expect(screen.getByLabelText('Switch off').props.accessibilityState).toMatchObject({ disabled: true });
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it("says the web's sentence when the switch did not happen", async () => {
    mockMutate.mockRejectedValue(new ApiError('Offline', 0));
    await openOff();
    await act(async () => {
      fireEvent.press(screen.getByText('Switch off'));
    });
    expect(screen.getByText("We couldn't reach ResNeo. Check your connection and try again.")).toBeTruthy();
  });

  it('offers to pause the loyalty card only while it is on', async () => {
    mockSwitches = onResponse({ in_use: { rewards_waiting: 2 } });
    await openOff();
    expect(screen.getByText("2 clients have a loyalty reward waiting. They're kept for if you switch back on.")).toBeTruthy();
    expect(screen.queryByText('Pause the loyalty card instead')).toBeNull();
  });

  it('keeps Checkout on when asked', async () => {
    await openOff();
    await act(async () => {
      fireEvent.press(screen.getByText('Keep Checkout on'));
    });
    expect(screen.queryByText('Switch off Checkout?')).toBeNull();
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
