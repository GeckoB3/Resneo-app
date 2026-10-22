/**
 * "Get this phone ready" (design 6.6, drawn as C4): the device check (an iPhone XS or newer;
 * Android 13 or newer with contactless), notifications, Tap to Pay on iPhone through the app's own
 * set-up, the tick once this phone registers, and what is missing first (Stripe, card payments in
 * person, which only an admin turns on).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import type { ReactNode } from 'react';

import { PhoneReadyScreen } from '@/components/pos/setup/PhoneReadyScreen';
import { setupVenue } from '@/lib/pos/setup/test-fixtures';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'opened' })) }));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('@/components/payments/TapToPaySettings', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { TapToPaySettings: () => React.createElement(Text, null, 'Set up Tap to Pay on iPhone') };
});
let mockVenue: Record<string, unknown> = {};
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ venue: mockVenue, refetch: jest.fn() }) }));
let mockRole = 'admin';
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => ({ data: { staff: { id: 'staff-1', role: mockRole } } }) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/queries/usePos', () => ({ usePosEnabled: () => true }));
let mockTapToPay: Record<string, unknown> = {};
jest.mock('@/providers/TapToPayProvider', () => ({ useTapToPay: () => mockTapToPay }));
jest.mock('@/lib/payments/tap-to-pay-build-support', () => ({ buildSupportsTapToPay: () => mockBuildSupports }));
let mockBuildSupports = true;
let mockStripe: unknown = { connected: true, charges_enabled: true, details_submitted: true };
jest.mock('@/lib/queries/useBillingStatus', () => ({
  useStripeConnect: () => ({ data: mockStripe, isLoading: false, refetch: jest.fn() }),
  useStripeConnectLink: () => ({ mutate: jest.fn(), isPending: false }),
}));
const mockUpdateVenue = jest.fn();
jest.mock('@/lib/queries/useVenueSettings', () => ({ useUpdateVenue: () => ({ mutate: mockUpdateVenue, isPending: false }) }));
let mockPhones: unknown = { can_take_cards: true, phones: [] };
const mockPhonesOptions: { enabled?: boolean; poll?: boolean }[] = [];
jest.mock('@/lib/queries/usePosSetup', () => ({
  useRefreshPosBootstrap: () => jest.fn(),
  useCollectPhones: (options: { enabled?: boolean; poll?: boolean }) => {
    mockPhonesOptions.push(options);
    return { data: options.enabled ? mockPhones : undefined };
  },
}));
let mockPermission = 'granted';
const mockRegister = jest.fn();
jest.mock('@/lib/push/notificationsModule', () => ({
  Notifications: { getPermissionsAsync: async () => ({ status: mockPermission }) },
}));
jest.mock('@/lib/push/registerDevice', () => ({ registerCurrentDeviceForPush: (...args: unknown[]) => mockRegister(...args) }));

const originalOS = Platform.OS;
const originalVersion = Platform.Version;
function onPlatform(os: 'ios' | 'android', version: string | number) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
}

beforeEach(() => {
  mockBack.mockReset();
  mockUpdateVenue.mockReset();
  mockRegister.mockReset();
  mockPhonesOptions.length = 0;
  mockRole = 'admin';
  mockVenue = setupVenue({ in_person_payments_enabled: true, card_present_ready: true });
  mockTapToPay = { applies: true, supported: true, updateRequired: false, termsAccepted: false, isAdmin: true };
  mockBuildSupports = true;
  mockStripe = { connected: true, charges_enabled: true, details_submitted: true };
  mockPhones = { can_take_cards: true, phones: [] };
  mockPermission = 'granted';
  onPlatform('ios', '18.1');
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  Object.defineProperty(Platform, 'Version', { value: originalVersion, configurable: true });
});

describe('Get this phone ready', () => {
  it('checks an iPhone, offers Tap to Pay on iPhone set-up, and waits for the phone to check in', async () => {
    await render(<PhoneReadyScreen />);
    expect(await screen.findByText('Notifications are on')).toBeTruthy();
    expect(screen.getByText('This iPhone can take cards')).toBeTruthy();
    expect(screen.getByText("Tap to Pay on iPhone isn't set up yet")).toBeTruthy();
    expect(screen.getByText('Set up Tap to Pay on iPhone')).toBeTruthy();
    expect(screen.getByText('Waiting for this phone to check in. It can take a minute.')).toBeTruthy();
    expect(mockPhonesOptions.at(-1)).toEqual(expect.objectContaining({ enabled: true, poll: true }));
  });

  it('ticks the phone off once the server lists it', async () => {
    mockTapToPay = { ...mockTapToPay, termsAccepted: true };
    mockPhones = { can_take_cards: true, phones: [{ staff_id: 'staff-1', name: 'Sam', devices: ['iphone'] }] };
    await render(<PhoneReadyScreen />);
    expect(await screen.findByText('This phone is ready to take cards')).toBeTruthy();
    expect(screen.getByText('Tap to Pay on iPhone is set up')).toBeTruthy();
  });

  it('turns away an iPhone older than the XS', async () => {
    mockBuildSupports = false;
    await render(<PhoneReadyScreen />);
    expect(await screen.findByText("This iPhone can't take cards. Tap to Pay on iPhone needs an iPhone XS or newer.")).toBeTruthy();
    expect(screen.queryByText('Set up Tap to Pay on iPhone')).toBeNull();
    expect(screen.queryByText(/Waiting for this phone/)).toBeNull();
  });

  it('checks Android 13 or newer, and turns away older Android', async () => {
    mockTapToPay = { applies: false, supported: null, updateRequired: false, termsAccepted: null, isAdmin: true };
    onPlatform('android', 34);
    await render(<PhoneReadyScreen />);
    expect(await screen.findByText('This phone runs Android 13 or newer. It can take cards if it has contactless (NFC).')).toBeTruthy();
    expect(screen.queryByText('Set up Tap to Pay on iPhone')).toBeNull();
    onPlatform('android', 31);
    await render(<PhoneReadyScreen />);
    expect(await screen.findByText("This phone can't take cards. It needs Android 13 or newer, with contactless (NFC).")).toBeTruthy();
  });

  it('turns notifications on when they are not yet asked for', async () => {
    mockPermission = 'undetermined';
    mockRegister.mockResolvedValue({ registered: true, pushToken: 'x' });
    await render(<PhoneReadyScreen />);
    await act(async () => {
      fireEvent.press(await screen.findByText('Turn on notifications'));
    });
    expect(mockRegister).toHaveBeenCalledWith({ accessToken: 'token-A', audience: 'staff' });
  });

  it('says what is missing first: card payments in person (an admin turns them on) and Stripe', async () => {
    mockVenue = setupVenue({ in_person_payments_enabled: false });
    mockStripe = null;
    await render(<PhoneReadyScreen />);
    expect(await screen.findByText("Card payments in person are switched off, so this phone can't take cards yet.")).toBeTruthy();
    expect(screen.getByText('First, connect Stripe')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Turn on card payments in person'));
    });
    expect(mockUpdateVenue).toHaveBeenCalledWith({ in_person_payments_enabled: true }, expect.anything());
    expect(screen.queryByText(/Waiting for this phone/)).toBeNull();
  });

  it('keeps connecting Stripe (payouts) to the owner or an admin with the billing switch', async () => {
    mockVenue = setupVenue({ in_person_payments_enabled: true, current_user_billing_payouts_admins: false });
    mockStripe = null;
    await render(<PhoneReadyScreen />);
    expect(await screen.findByText('First, connect Stripe')).toBeTruthy();
    expect(screen.getByText('Only the owner, or an admin they allow, can do this.')).toBeTruthy();
    expect(screen.queryByText('Connect Stripe')).toBeNull();
  });

  it('tells a team member to ask an admin', async () => {
    mockRole = 'staff';
    mockVenue = setupVenue({ in_person_payments_enabled: false, current_user_role: 'staff' });
    await render(<PhoneReadyScreen />);
    expect(await screen.findByText('Ask an admin to turn on card payments in person.')).toBeTruthy();
    expect(screen.queryByText('Turn on card payments in person')).toBeNull();
  });

  it('goes back when done', async () => {
    await render(<PhoneReadyScreen />);
    await act(async () => {
      fireEvent.press(await screen.findByText('Done'));
    });
    expect(mockBack).toHaveBeenCalled();
  });
});
