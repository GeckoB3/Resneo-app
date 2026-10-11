/**
 * The landing while Checkout is off (POS Part 5, design section 14 steps 2, 3 and 8; C2): what an
 * admin of an offered venue reads, the extras the dial offers, the switch-on sheet with the
 * seller's tick at the first switch-on, the calls it makes, where it lands, and every state shown
 * instead of the button (paused, for everyone, pounds only, the plan, not offered, a team member,
 * and an older server that sends no offer).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { CheckoutLanding } from '@/components/pos/switches/CheckoutLanding';
import { ApiError } from '@/lib/api/client';
import { onResponse, switchesResponse } from '@/lib/pos/switches/test-fixtures';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockPush = jest.fn();
const mockSetParams = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
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
let mockVenue: Record<string, unknown> | null = null;
const mockRefetchVenue = jest.fn();
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue, refetch: mockRefetchVenue, terminology: { client: 'client', booking: 'appointment', staff: 'staff' } }),
}));
let mockRole: 'admin' | 'staff' = 'admin';
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { id: 'staff-1', role: mockRole } }, isLoading: false }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
let mockSwitches: unknown;
let mockSwitchesError = false;
const mockSwitchesEnabled: (boolean | undefined)[] = [];
const mockMutate = jest.fn();
const mockApply = jest.fn();
jest.mock('@/lib/queries/useFeatureSwitches', () => ({
  useFeatureSwitches: (options: { enabled?: boolean } = {}) => {
    mockSwitchesEnabled.push(options.enabled);
    return {
      data: options.enabled === false ? undefined : mockSwitches,
      isLoading: false,
      isError: mockSwitchesError,
      refetch: jest.fn(),
    };
  },
  useSetFeatureSwitch: () => ({ mutateAsync: mockMutate, isPending: false }),
  applySwitchResult: (...args: unknown[]) => mockApply(...args),
}));

function venue(offer: Record<string, unknown> | undefined, raw: Record<string, unknown> = {}) {
  return {
    id: 'venue-1',
    name: 'Bloom Hair Studio',
    current_user_role: mockRole,
    feature_flags: { raw, resolved: {} },
    ...(offer ? { feature_offers: { pos: { reason: null, public_reason: null, ...offer } } } : {}),
  };
}

async function show(variant: 'checkout' | 'settings' = 'checkout') {
  const client = new QueryClient();
  await render(
    <QueryClientProvider client={client}>
      <CheckoutLanding variant={variant} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockPush.mockReset();
  mockSetParams.mockReset();
  mockMutate.mockReset();
  mockApply.mockReset();
  mockRefetchVenue.mockReset();
  mockSwitchesEnabled.length = 0;
  mockRole = 'admin';
  mockSwitchesError = false;
  mockSwitches = switchesResponse();
  mockVenue = venue({ state: 'available' });
});

describe('the landing for an admin of an offered venue', () => {
  it("says what Checkout is, the extras on offer, what it costs and what you'll need", async () => {
    await show();
    expect(screen.getByText('Take payments on your phone and at your desk')).toBeTruthy();
    expect(screen.getByText(/^Included in your plan\. Card payments go straight to your own Stripe account\./)).toBeTruthy();
    expect(screen.getByText('Add extras if you like')).toBeTruthy();
    expect(screen.getByText('Gift vouchers')).toBeTruthy();
    expect(screen.getByText('Loyalty card')).toBeTruthy();
    // The shop is not offered by the dial in the fixture, so it is not a tick.
    expect(screen.queryByText('Online shop')).toBeNull();
    expect(screen.getByText('What it costs')).toBeTruthy();
    expect(screen.getByText("What you'll need")).toBeTruthy();
    expect(screen.getByText('Nothing to get started. You can take cash straight away.')).toBeTruthy();
    expect(screen.queryByText('Stripe is connected.')).toBeNull();
    expect(screen.getByText('You can switch it off whenever you like. Nothing is deleted.')).toBeTruthy();
    expect(screen.getByText('Switch on Checkout')).toBeTruthy();
  });

  it('says when Stripe is connected, and the collective sentence at a collective', async () => {
    mockSwitches = switchesResponse({
      prerequisites: { stripe_connected: true, stripe_charges_enabled: true, in_person_payments_enabled: true },
      venue: { name: 'Bloom Hair Studio', currency: 'GBP', collective_name: 'Bloom and Brow' },
    });
    await show();
    expect(screen.getByText('Stripe is connected.')).toBeTruthy();
    expect(screen.getByText(/Checkout is for Bloom Hair Studio only\. Each business in Bloom and Brow has its own till/)).toBeTruthy();
  });

  it('says the switches could not be read, with a retry', async () => {
    mockSwitches = undefined;
    mockSwitchesError = true;
    await show();
    expect(screen.getByText("We couldn't load your Checkout settings. Please try again.")).toBeTruthy();
  });
});

describe('switching on', () => {
  it("asks for the seller's tick at the first switch-on, then switches Checkout on and opens set-up", async () => {
    const after = onResponse();
    mockMutate.mockResolvedValue({ ok: true, switches: after });
    await show();
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on Checkout'));
    });
    expect(screen.getByText('Switch on Checkout for Bloom Hair Studio?')).toBeTruthy();
    expect(screen.getByText("Here's what changes:")).toBeTruthy();
    expect(screen.getByText('In the ResNeo app, Take payment becomes Check out. Tap to Pay works the same way.')).toBeTruthy();
    const confirm = screen.getByText('Switch on and set up');
    await act(async () => {
      fireEvent.press(confirm);
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
    expect(mockApply).toHaveBeenCalledWith(expect.anything(), 'token-A', after);
    // POS Part 4: switching on hands straight into the set-up wizard's welcome (W0).
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/welcome');
  });

  it('does not ask for the tick again once accepted', async () => {
    mockSwitches = switchesResponse({ terms_accepted: true });
    mockMutate.mockResolvedValue({ ok: true, switches: onResponse() });
    await show();
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on Checkout'));
    });
    expect(screen.queryByLabelText(/is the seller/)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on and set up'));
    });
    expect(mockMutate.mock.calls[0][0]).not.toHaveProperty('acknowledge_terms_version');
  });

  it('brings Checkout with gift vouchers chosen alone, saying so (SW4)', async () => {
    mockSwitches = switchesResponse({ terms_accepted: true });
    mockMutate.mockResolvedValue({ ok: true, switches: onResponse() });
    await show();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Gift vouchers/));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on Checkout'));
    });
    expect(
      screen.getByText("Gift vouchers are taken as payment at Checkout, so we'll switch that on too, in its simplest form."),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on and set up'));
    });
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'pos_gift_vouchers_enabled', on: true, also_checkout: true, version: 1 }),
    );
  });

  it('switches each ticked extra on with the latest version, and names one that did not come on', async () => {
    mockSwitches = switchesResponse({ terms_accepted: true });
    const first = onResponse({ switches: { pos_loyalty_enabled: { version: 4 } } });
    mockMutate
      .mockResolvedValueOnce({ ok: true, switches: first })
      .mockRejectedValueOnce(new ApiError('Not now', 409, { error: 'Not now', code: 'SWITCH_NOT_AVAILABLE', reason: 'billing' }));
    await show();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Gift vouchers/));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Loyalty card/));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on Checkout'));
    });
    // Loyalty ticked: clients' cards and reward emails are said.
    expect(screen.getByText(/Clients will see their loyalty card/)).toBeTruthy();
    // Checkout comes with the first extra ticked, in the web's words for it.
    expect(screen.getByText("Gift vouchers are taken as payment at Checkout, so we'll switch that on too, in its simplest form.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on and set up'));
    });
    expect(mockMutate.mock.calls.map((c) => [c[0].feature, c[0].also_checkout ?? false, c[0].version])).toEqual([
      ['pos_gift_vouchers_enabled', true, 1],
      ['pos_loyalty_enabled', false, 4],
    ]);
    expect(mockApply).toHaveBeenCalledWith(expect.anything(), 'token-A', first);
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/welcome?missed=pos_loyalty_enabled');
  });

  it("says why Checkout did not come on, and keeps the sheet", async () => {
    mockSwitches = switchesResponse({ terms_accepted: true });
    mockMutate.mockRejectedValue(new ApiError('Lapsed', 409, { error: 'Lapsed', code: 'SWITCH_NOT_AVAILABLE', reason: 'billing' }));
    await show();
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on Checkout'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on and set up'));
    });
    expect(
      screen.getByText('Your plan needs attention. Once your subscription is sorted in Plan & payments, you can switch on Checkout.'),
    ).toBeTruthy();
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens set-up from Checkout settings too, with Checkout settings left underneath', async () => {
    mockSwitches = switchesResponse({ terms_accepted: true });
    mockMutate.mockResolvedValue({ ok: true, switches: onResponse() });
    await show('settings');
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on Checkout'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Switch on and set up'));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/welcome');
    expect(mockSetParams).not.toHaveBeenCalled();
  });
});

describe('the states instead of the button', () => {
  it("says ResNeo paused it, with its reason, and keeps Sales history after Checkout was on", async () => {
    mockVenue = venue({ state: 'paused', reason: 'blocked', public_reason: "we're checking a payment with Stripe" }, { pos_enabled: false });
    await show();
    expect(screen.getByText('Checkout is paused')).toBeTruthy();
    expect(
      screen.getByText(
        "ResNeo has paused Checkout for Bloom Hair Studio: we're checking a payment with Stripe. You can still see past sales and give refunds. Contact ResNeo support if you have any questions.",
      ),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Sales history'));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout/all-sales');
    // Paused: the switches are not asked for.
    expect(mockSwitchesEnabled.every((e) => e === false)).toBe(true);
  });

  it('says it is paused for everyone while the environment switch is set', async () => {
    mockVenue = venue({ state: 'paused', reason: 'environment' });
    await show();
    expect(screen.getByText('Checkout is paused for everyone for a short while. Please try again later.')).toBeTruthy();
    expect(screen.queryByText('Sales history')).toBeNull();
  });

  it('says pounds only, and the plan needing attention, in place of the button', async () => {
    mockVenue = venue({ state: 'not_available', reason: 'currency' });
    await show();
    expect(screen.getByText("Checkout works in pounds for now. We'll let you know when it works in euros.")).toBeTruthy();
    expect(screen.queryByText('Switch on Checkout')).toBeNull();

    mockVenue = venue({ state: 'not_available', reason: 'billing' });
    await show();
    expect(screen.getByText(/Your plan needs attention/)).toBeTruthy();
  });

  it("says what it said before at a venue not offered it, and to an older server's admin", async () => {
    mockVenue = venue({ state: 'not_available', reason: 'not_offered' });
    await show();
    expect(screen.getByText("Checkout isn't switched on")).toBeTruthy();
    expect(screen.getByText("Checkout isn't available for Bloom Hair Studio yet. If you think it should be, contact ResNeo support.")).toBeTruthy();

    mockVenue = venue(undefined);
    await show();
    expect(screen.getAllByText("Checkout isn't switched on").length).toBeGreaterThan(0);
    expect(screen.queryByText('Switch on Checkout')).toBeNull();
  });

  it('tells a team member to ask an admin, and reads nothing (SW1)', async () => {
    mockRole = 'staff';
    mockVenue = venue({ state: 'available' });
    await show();
    expect(screen.getByText("Checkout isn't switched on")).toBeTruthy();
    expect(screen.getByText('Ask an admin to switch on Checkout.')).toBeTruthy();
    expect(mockSwitchesEnabled.every((e) => e === false)).toBe(true);
  });

  it('reads the venue again when the switches say Checkout is already on', async () => {
    mockSwitches = onResponse();
    await show();
    expect(mockRefetchVenue).toHaveBeenCalled();
    expect(screen.queryByText('Switch on Checkout')).toBeNull();
  });
});
