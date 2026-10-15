/**
 * Booking settings, "Taking payment in person": the in-person payments master switch (Tap to Pay
 * §6.7), the card reader row, Tap to Pay on iPhone and the Checkout switch, moved here from More
 * (owner, 2026-10-15) to match the web's Settings, Booking Settings.
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
const mockReaderSheet = jest.fn((_props: { visible: boolean }) => null);
jest.mock('@/components/bookings/ReaderSettingsSheet', () => ({
  ReaderSettingsSheet: (props: { visible: boolean }) => mockReaderSheet(props),
}));

let mockEnabled = false;
let mockStripeAccount: string | null = 'acct_123';
let mockTier = 'appointments';
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
      feature_flags: { resolved: {}, raw: {} },
      in_person_payments_enabled: mockEnabled,
      stripe_connected_account_id: mockStripeAccount,
    },
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

import BookingSettingsScreen from '@/app/(app)/manage/booking-settings';

const SWITCH = 'Take card payments at your venue';

beforeEach(() => {
  mockEnabled = false;
  mockStripeAccount = 'acct_123';
  mockTier = 'appointments';
  mockTapToPayApplies = false;
  mockUpdateVenue.mockClear();
  mockReaderSheet.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
});

describe('Booking settings: Taking payment in person', () => {
  it('sits in Booking settings with the Checkout switch under it', async () => {
    await render(<BookingSettingsScreen />);
    expect(screen.getByText('Taking payment in person')).toBeTruthy();
    expect(screen.getByLabelText(SWITCH)).toBeTruthy();
    expect(screen.getByText('Checkout switch card')).toBeTruthy();
  });

  it('is not there on a plan without appointments, as on the web', async () => {
    mockTier = 'restaurant';
    await render(<BookingSettingsScreen />);
    expect(screen.queryByText('Taking payment in person')).toBeNull();
    expect(screen.queryByLabelText(SWITCH)).toBeNull();
    expect(screen.queryByText('Checkout switch card')).toBeNull();
  });

  it('lets an admin turn it on, sending only that field', async () => {
    await render(<BookingSettingsScreen />);
    await act(async () => {
      fireEvent(screen.getByLabelText(SWITCH), 'valueChange', true);
    });
    expect(mockUpdateVenue).toHaveBeenCalledWith({ in_person_payments_enabled: true });
    expect(mockToast.success).toHaveBeenCalledWith('In-person payments turned on.');
  });

  it('lets an admin turn it back off', async () => {
    mockEnabled = true;
    await render(<BookingSettingsScreen />);
    await act(async () => {
      fireEvent(screen.getByLabelText(SWITCH), 'valueChange', false);
    });
    expect(mockUpdateVenue).toHaveBeenCalledWith({ in_person_payments_enabled: false });
    expect(mockToast.success).toHaveBeenCalledWith('In-person payments turned off.');
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
    expect(mockToast.error).toHaveBeenCalledWith('Could not change in-person payments. Try again.');
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('warns when Stripe is not connected, because the flag alone does nothing', async () => {
    mockEnabled = true;
    mockStripeAccount = null;
    await render(<BookingSettingsScreen />);
    expect(screen.getByText(/Connect Stripe first/)).toBeTruthy();
  });

  it('does not nag about Stripe when the venue is connected', async () => {
    mockEnabled = true;
    await render(<BookingSettingsScreen />);
    expect(screen.queryByText(/Connect Stripe first/)).toBeNull();
  });

  it('reassures that collecting is never compulsory', async () => {
    mockEnabled = true;
    await render(<BookingSettingsScreen />);
    expect(screen.getByText(/always your team's choice/)).toBeTruthy();
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
