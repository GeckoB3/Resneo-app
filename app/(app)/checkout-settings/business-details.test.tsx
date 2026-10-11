/**
 * Business details follow the venue profile (POS Part 4, owner decision OB5): Checkout settings'
 * Business details shows and edits the profile's name, address, email and phone (saved to the
 * profile, "This also changes your booking page."), with an optional receipt-only value for each;
 * the profile part is an admin's, so a team member who may change Checkout settings sees it read
 * only. Also "Sell products" (OB3) in Features: shown when the server has it, asked about before it
 * goes off.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { setupSettings, setupVenue } from '@/lib/pos/setup/test-fixtures';
import BusinessScreen from './business';
import FeaturesScreen from './features';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
  useLocalSearchParams: () => ({}),
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
let mockVenue: Record<string, unknown> = {};
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue, terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({ data: { feature_flags: { raw: {}, resolved: { pos_enabled: true } } } }),
}));
jest.mock('@/lib/queries/usePos', () => ({ usePosEnabled: () => true }));
const mockUpdateVenue = jest.fn();
jest.mock('@/lib/queries/useVenueSettings', () => ({ useUpdateVenue: () => ({ mutateAsync: mockUpdateVenue, isPending: false }) }));
let mockSettings: unknown = null;
const mockSave = jest.fn();
jest.mock('@/lib/queries/useCheckoutSettings', () => {
  const actual = jest.requireActual<typeof import('@/lib/queries/useCheckoutSettings')>('@/lib/queries/useCheckoutSettings');
  return {
    settingsPaths: actual.settingsPaths,
    useCheckoutSettingsQuery: () => ({ data: mockSettings, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() }),
    useSaveCheckoutSettings: () => mockSave,
    useSettingsWrite: () => jest.fn(),
  };
});


const STAFF = { is_admin: false, manage_settings: true, edit_capabilities: false };

beforeEach(() => {
  mockUpdateVenue.mockReset();
  mockSave.mockReset();
  mockToast.success.mockClear();
  mockVenue = setupVenue();
  mockSettings = setupSettings();
  mockSave.mockResolvedValue({ ok: true });
  mockUpdateVenue.mockResolvedValue({});
});

describe('Business details (OB5)', () => {
  it("shows the profile's values, saying the booking page changes too", async () => {
    await render(<BusinessScreen />);
    expect(screen.getByText('Your business details')).toBeTruthy();
    expect(screen.getByDisplayValue('Bloom Hair Studio')).toBeTruthy();
    expect(screen.getByDisplayValue('12 Market Street')).toBeTruthy();
    expect(screen.getByDisplayValue('hello@bloom.example')).toBeTruthy();
    expect(screen.getByText('This also changes your booking page.')).toBeTruthy();
    // Checkout's own details stay; the four that follow the profile are no longer asked for there.
    expect(screen.getByText('Legal name')).toBeTruthy();
    expect(screen.queryByText('Trading name')).toBeNull();
    expect(screen.queryByText('Public contact email')).toBeNull();
  });

  it('saves a profile change to the profile and a receipt-only value to Checkout', async () => {
    await render(<BusinessScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Phone for clients'), '07700 900123');
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Show different details on receipts'), 'valueChange', true);
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Email on receipts'), 'receipts@bloom.example');
    });
    await act(async () => {
      fireEvent.press(screen.getAllByText('Save changes')[0]!);
    });
    expect(mockUpdateVenue).toHaveBeenCalledWith({ phone: '+447700900123' });
    expect(mockSave).toHaveBeenCalledWith({ public_contact_email: 'receipts@bloom.example' });
    expect(mockToast.success).toHaveBeenCalledWith('Business details saved.');
  });

  it('lets a team member set receipt-only values but not change the profile', async () => {
    mockSettings = setupSettings({ trading_name: 'Bloom Ltd' }, STAFF);
    await render(<BusinessScreen />);
    expect(screen.getByText('These come from your business profile. Only an admin can change them.')).toBeTruthy();
    expect(screen.getByDisplayValue('Bloom Hair Studio').props.editable).toBe(false);
    expect(screen.getByDisplayValue('Bloom Ltd').props.editable).toBe(true);
  });
});

describe('Sell products in Features (OB3)', () => {
  it('asks before turning it off, then saves only that key', async () => {
    await render(<FeaturesScreen />);
    await act(async () => {
      fireEvent(screen.getByLabelText('Sell products'), 'valueChange', false);
    });
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.getByText('Turn off Sell products?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Turn off'));
    });
    expect(mockSave).toHaveBeenCalledWith({ sell_products_enabled: false });
  });

  it('stays on and fixed while the online shop is on, saying why', async () => {
    mockSettings = { ...setupSettings({ sell_products_enabled: true }), sell_products_needed_by_shop: true };
    await render(<FeaturesScreen />);
    expect(screen.getByLabelText('Sell products').props.accessibilityState).toEqual(expect.objectContaining({ checked: true, disabled: true }));
    expect(screen.getByText('Your online shop sells your products, so this stays on while your shop is on.')).toBeTruthy();
  });

  it("shows the server's sentence when it refuses because of the shop", async () => {
    const sentence =
      'Your online shop sells your products, so Sell products stays on while your shop is on. Switch the shop off first to stop selling products.';
    mockSave.mockResolvedValue({ ok: false, stale: false, message: sentence, fields: [{ path: 'sell_products_enabled', message: sentence }] });
    await render(<FeaturesScreen />);
    await act(async () => {
      fireEvent(screen.getByLabelText('Sell products'), 'valueChange', false);
    });
    expect(
      screen.getByText(
        'Products and stock leaves More, and the till stops offering products. Nothing is deleted. If you turn it back on later, everything will be as you left it.',
      ),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Turn off'));
    });
    expect(screen.getByText(sentence)).toBeTruthy();
  });

  it('is not shown by a server that does not have it', async () => {
    const response = setupSettings();
    delete (response.settings as { sell_products_enabled?: boolean }).sell_products_enabled;
    mockSettings = response;
    await render(<FeaturesScreen />);
    expect(screen.queryByText('Sell products')).toBeNull();
    expect(screen.getByText('Track stock')).toBeTruthy();
  });
});
