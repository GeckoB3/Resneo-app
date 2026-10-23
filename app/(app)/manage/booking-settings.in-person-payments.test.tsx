/**
 * Booking settings, "Payments at your venue": Card payments in person, the in-person payments
 * master switch (Tap to Pay §6.7), the card reader row, Tap to Pay on iPhone and the Checkout
 * switch, moved here from More (owner, 2026-10-15) to match the web's Settings, Booking Settings.
 * The words are the owner's of 2026-10-22, shared with the web: what the switch does with Checkout
 * off and on, and what switching it off stops.
 *
 * The switch's gating that makes it safe in the app: admins only (the whole screen is), the
 * "Stripe not connected yet" caveat, and a rollback so a failed PATCH can't leave the switch lying
 * about venue state. The Checkout switch card has its own suite (CheckoutSwitchCard.test).
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children, ...props }: { children: ReactNode }) => React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: { children: ReactNode }) => React.createElement(View, null, children),
  };
});

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

const mockUpdateVenue = jest.fn(async (_input: Record<string, unknown>) => ({}));
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useFeatureFlags: () => ({ data: { calendars: [], any_available_practitioner_config: undefined }, isLoading: false }),
  useUpdateFeatureFlags: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateVenue: () => ({ mutateAsync: mockUpdateVenue, isPending: false }),
}));

let mockTapToPayApplies = false;
jest.mock('@/providers/TapToPayProvider', () => ({ useTapToPay: () => ({ applies: mockTapToPayApplies }) }));
function mockStub(text: string) {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return React.createElement(Text, null, text);
}
jest.mock('@/components/payments/TapToPaySettings', () => ({ TapToPaySettings: () => mockStub('Tap to Pay settings') }));
jest.mock('@/components/pos/switches/CheckoutSwitchCard', () => ({ CheckoutSwitchCard: () => mockStub('Checkout switch card') }));
// Treatment records' own switch reads and writes through react-query; its suite covers it.
jest.mock('@/components/treatment-records/TreatmentRecordsSwitchCard', () => ({ TreatmentRecordsSwitchCard: () => null }));
const mockReaderSheet = jest.fn((_props: { visible: boolean }) => null);
jest.mock('@/components/bookings/ReaderSettingsSheet', () => ({
  ReaderSettingsSheet: (props: { visible: boolean }) => mockReaderSheet(props),
}));

let mockEnabled = false;
let mockStripeAccount: string | null = 'acct_123';
let mockTier = 'appointments';
let mockPosOn = false;
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: {
      id: 'venue-1',
      name: 'Bloom Hair Studio',
      current_user_role: 'admin',
      pricing_tier: mockTier,
      booking_model: 'unified_scheduling',
      active_booking_models: ['unified_scheduling'],
      require_account_login_for_bookings: false,
      feature_flags: { resolved: mockPosOn ? { pos_enabled: true } : {}, raw: {} },
      in_person_payments_enabled: mockEnabled,
      stripe_connected_account_id: mockStripeAccount,
    },
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

import BookingSettingsScreen from '@/app/(app)/manage/booking-settings';

const SWITCH = 'Take card payments in person';
const GROUP = 'Payments at your venue';
const DESCRIPTION_CHECKOUT_OFF =
  'Your team can take payment for an appointment in the ResNeo app: by card, with Tap to Pay on their phone or a Bluetooth card reader, or by recording cash or another way. Money goes straight to your own Stripe account and ResNeo takes no cut.';
const DESCRIPTION_CHECKOUT_ON =
  'Checkout takes cards in person only while this is on: with Tap to Pay or a Bluetooth card reader in the ResNeo app, on your counter card readers, or by sending a sale to a phone. Money goes straight to your own Stripe account and ResNeo takes no cut.';
const OFF_CHECKOUT_OFF = 'While this is off, nobody can take payment on an appointment in the ResNeo app.';
const OFF_CHECKOUT_ON =
  "Checkout is on, but it can't take cards in person until you turn this on. It can still take cash, pay links and gift vouchers.";
const CHOICE =
  "Taking a payment is always your team's choice, appointment by appointment. Turning this on never requires anyone to collect payment, and an appointment can still be completed with a balance outstanding.";
const PHONES =
  'Your team also needs the latest ResNeo app on a supported phone: iPhone XS or newer (iOS 16.4+), or an Android phone with contactless (NFC) running Android 13 or newer.';

beforeEach(() => {
  mockEnabled = false;
  mockStripeAccount = 'acct_123';
  mockTier = 'appointments';
  mockPosOn = false;
  mockTapToPayApplies = false;
  mockUpdateVenue.mockClear();
  mockReaderSheet.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
});

describe('Booking settings: Payments at your venue', () => {
  it('sits in Booking settings with the Checkout switch under it', async () => {
    await render(<BookingSettingsScreen />);
    expect(screen.getByText(GROUP)).toBeTruthy();
    expect(screen.getByText('How your team takes payment from clients at your venue.')).toBeTruthy();
    expect(screen.getByText('Card payments in person')).toBeTruthy();
    expect(screen.getByText(SWITCH)).toBeTruthy();
    expect(screen.getByLabelText(SWITCH)).toBeTruthy();
    expect(screen.getByText('Checkout switch card')).toBeTruthy();
    expect(screen.queryByText('Taking payment in person')).toBeNull();
    expect(screen.queryByText('Take card payments at your venue')).toBeNull();
  });

  it('keeps the group heading and line the same with Checkout on', async () => {
    mockPosOn = true;
    await render(<BookingSettingsScreen />);
    expect(screen.getByText(GROUP)).toBeTruthy();
    expect(screen.getByText('How your team takes payment from clients at your venue.')).toBeTruthy();
  });

  it('is not there on a plan without appointments, as on the web', async () => {
    mockTier = 'restaurant';
    await render(<BookingSettingsScreen />);
    expect(screen.queryByText(GROUP)).toBeNull();
    expect(screen.queryByLabelText(SWITCH)).toBeNull();
    expect(screen.queryByText('Checkout switch card')).toBeNull();
  });

  it('lets an admin turn it on, sending only that field', async () => {
    await render(<BookingSettingsScreen />);
    await act(async () => {
      fireEvent(screen.getByLabelText(SWITCH), 'valueChange', true);
    });
    expect(mockUpdateVenue).toHaveBeenCalledWith({ in_person_payments_enabled: true });
    expect(mockToast.success).toHaveBeenCalledWith('Card payments in person turned on.');
  });

  it('lets an admin turn it back off', async () => {
    mockEnabled = true;
    await render(<BookingSettingsScreen />);
    await act(async () => {
      fireEvent(screen.getByLabelText(SWITCH), 'valueChange', false);
    });
    expect(mockUpdateVenue).toHaveBeenCalledWith({ in_person_payments_enabled: false });
    expect(mockToast.success).toHaveBeenCalledWith('Card payments in person turned off.');
  });

  it('rolls the switch back and says so when the save fails', async () => {
    mockUpdateVenue.mockRejectedValueOnce(new Error('network'));
    await render(<BookingSettingsScreen />);
    expect(screen.getByLabelText(SWITCH).props.value).toBe(false);
    await act(async () => {
      fireEvent(screen.getByLabelText(SWITCH), 'valueChange', true);
    });
    // Back to the venue's real state rather than stranded on a lie.
    expect(screen.getByLabelText(SWITCH).props.value).toBe(false);
    expect(mockToast.error).toHaveBeenCalledWith('Could not change Card payments in person. Try again.');
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('warns when Stripe is not connected, because the flag alone does nothing, and says it is done on the web', async () => {
    mockEnabled = true;
    mockStripeAccount = null;
    await render(<BookingSettingsScreen />);
    expect(
      screen.getByText(
        'Connect Stripe first, in More, then Plan & payments. Card payments go into your own Stripe account, so this has no effect until that is set up.',
      ),
    ).toBeTruthy();
  });

  it('does not nag about Stripe when the venue is connected', async () => {
    mockEnabled = true;
    await render(<BookingSettingsScreen />);
    expect(screen.queryByText(/Connect Stripe first/)).toBeNull();
  });

  it('reassures that collecting is never compulsory, on or off, while Checkout is off', async () => {
    mockEnabled = true;
    await render(<BookingSettingsScreen />);
    expect(screen.getByText(CHOICE)).toBeTruthy();

    mockEnabled = false;
    await render(<BookingSettingsScreen />);
    expect(screen.getByText(CHOICE)).toBeTruthy();
  });

  describe('with Checkout off', () => {
    it('says the switch covers every payment on an appointment, and that off stops them all', async () => {
      await render(<BookingSettingsScreen />);
      expect(screen.getByText(DESCRIPTION_CHECKOUT_OFF)).toBeTruthy();
      expect(screen.queryByText(DESCRIPTION_CHECKOUT_ON)).toBeNull();
      expect(screen.getByText(OFF_CHECKOUT_OFF)).toBeTruthy();
      expect(screen.queryByText(OFF_CHECKOUT_ON)).toBeNull();
      expect(screen.queryByTestId('card-payments-off-checkout-on')).toBeNull();
    });

    it('drops the off line once it is on, and names the phones it needs', async () => {
      mockEnabled = true;
      await render(<BookingSettingsScreen />);
      expect(screen.getByText(DESCRIPTION_CHECKOUT_OFF)).toBeTruthy();
      expect(screen.queryByText(OFF_CHECKOUT_OFF)).toBeNull();
      expect(screen.getByText(PHONES)).toBeTruthy();
    });

    it('says the off line as soon as the switch goes off', async () => {
      mockEnabled = true;
      await render(<BookingSettingsScreen />);
      expect(screen.queryByText(OFF_CHECKOUT_OFF)).toBeNull();
      await act(async () => {
        fireEvent(screen.getByLabelText(SWITCH), 'valueChange', false);
      });
      expect(screen.getByText(OFF_CHECKOUT_OFF)).toBeTruthy();
    });
  });

  describe('with Checkout on', () => {
    beforeEach(() => {
      mockPosOn = true;
    });

    it('says Checkout takes cards in person only while it is on, in amber while it is off, without the appointment lines', async () => {
      await render(<BookingSettingsScreen />);
      expect(screen.getByText(DESCRIPTION_CHECKOUT_ON)).toBeTruthy();
      expect(screen.queryByText(DESCRIPTION_CHECKOUT_OFF)).toBeNull();
      expect(screen.getByTestId('card-payments-off-checkout-on')).toBeTruthy();
      expect(screen.getByText(OFF_CHECKOUT_ON)).toBeTruthy();
      expect(screen.queryByText(OFF_CHECKOUT_OFF)).toBeNull();
      // The choice line is about appointments, so it is left out while Checkout is on.
      expect(screen.queryByText(CHOICE)).toBeNull();
    });

    it('drops the amber line once it is on', async () => {
      mockEnabled = true;
      await render(<BookingSettingsScreen />);
      expect(screen.getByText(DESCRIPTION_CHECKOUT_ON)).toBeTruthy();
      expect(screen.queryByText(OFF_CHECKOUT_ON)).toBeNull();
      expect(screen.queryByText(CHOICE)).toBeNull();
      expect(screen.getByText(PHONES)).toBeTruthy();
    });
  });

  it('keeps the reader row hidden until the venue flag is actually on, then opens its sheet', async () => {
    await render(<BookingSettingsScreen />);
    expect(screen.queryByText('Bluetooth card reader')).toBeNull();

    mockEnabled = true;
    await render(<BookingSettingsScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Bluetooth card reader'));
    });
    expect(mockReaderSheet).toHaveBeenLastCalledWith({ visible: true, onClose: expect.any(Function) });
  });

  it('shows Tap to Pay on iPhone where it applies', async () => {
    await render(<BookingSettingsScreen />);
    expect(screen.queryByText('Tap to Pay settings')).toBeNull();

    mockTapToPayApplies = true;
    await render(<BookingSettingsScreen />);
    expect(screen.getByText('Tap to Pay on iPhone')).toBeTruthy();
    expect(screen.getByText('Tap to Pay settings')).toBeTruthy();
  });
});
