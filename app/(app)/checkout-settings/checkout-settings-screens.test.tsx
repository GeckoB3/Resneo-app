/**
 * Checkout settings screens in the app (web: Settings, Checkout): the hub's rows and who may open
 * it, a section saving only its own keys, the tills refusal word for word, Features asking before a
 * switch goes off, removing a payment type with its version, and team permissions for admins only.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
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
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({ data: { feature_flags: { raw: {}, resolved: { pos_enabled: true, pos_gift_vouchers_enabled: true } } } }),
}));
jest.mock('@/lib/queries/usePos', () => ({ usePosEnabled: () => true }));

let mockSettings: Record<string, unknown> = {};
const mockSave = jest.fn();
const mockWrite = jest.fn();
let mockTills: unknown[] = [];
let mockTypes: unknown[] = [];
jest.mock('@/lib/queries/useCheckoutSettings', () => {
  const actual = jest.requireActual<typeof import('@/lib/queries/useCheckoutSettings')>('@/lib/queries/useCheckoutSettings');
  const list = (data: () => unknown[]) => () => ({
    data: data(),
    isLoading: false,
    isError: false,
    refetch: jest.fn(async () => ({ data: data() })),
  });
  return {
    settingsPaths: actual.settingsPaths,
    useCheckoutSettingsQuery: () => ({ data: mockSettings, isLoading: false, isError: false, isRefetching: false, refetch: jest.fn() }),
    useSaveCheckoutSettings: () => mockSave,
    useSettingsWrite: () => mockWrite,
    useReloadCheckoutSettings: () => jest.fn(),
    useSettingsTills: list(() => mockTills),
    useSettingsPaymentTypes: list(() => mockTypes),
    useSettingsDiscountPresets: list(() => []),
  };
});

import CashScreen from './cash';
import FeaturesScreen from './features';
import Hub from './index';
import PaymentTypesScreen from './payment-types';
import PermissionsScreen from './permissions';
import ReceiptsScreen from './receipts';
import TillsScreen from './tills';

function settingsResponse(can: { is_admin: boolean; manage_settings: boolean; edit_capabilities: boolean }, extra: Record<string, unknown> = {}) {
  return {
    settings: {
      version: 7,
      receipt_prefix: 'R-',
      receipt_footer: null,
      receipt_auto_send: 'ask',
      track_stock_enabled: false,
      cash_management_enabled: true,
      multiple_tills_enabled: true,
      max_payment_pence: 500000,
      blind_close: true,
      variance_reason_threshold_pence: 500,
      default_float_pence: 10000,
      legacy_cash_till_id: null,
      staff_max_discount_percent: 10,
      ...extra,
    },
    staff_capability_map: { create_sale: true, take_payment: true },
    capability_defaults: { create_sale: true, take_payment: true },
    can,
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
  };
}

const ADMIN = { is_admin: true, manage_settings: true, edit_capabilities: true };
const STAFF = { is_admin: false, manage_settings: true, edit_capabilities: false };

beforeEach(() => {
  mockSave.mockReset();
  mockWrite.mockReset();
  mockPush.mockReset();
  mockToast.success.mockClear();
  mockTills = [];
  mockTypes = [];
});

describe('the hub', () => {
  it('lists the sections this login sees and opens one', async () => {
    mockSettings = settingsResponse(ADMIN);
    await render(<Hub />);
    expect(screen.getByText('Business and tax details')).toBeTruthy();
    expect(screen.getByText('Who can do what')).toBeTruthy();
    expect(screen.getByText('Gift vouchers')).toBeTruthy();
    expect(screen.queryByText('Stock')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Tills'));
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout-settings/tills');
  });

  it('keeps admin-only rows from team members', async () => {
    mockSettings = settingsResponse(STAFF);
    await render(<Hub />);
    expect(screen.getByText('Receipts')).toBeTruthy();
    expect(screen.queryByText('Who can do what')).toBeNull();
    expect(screen.queryByText('Gift vouchers')).toBeNull();
    expect(screen.queryByText('Commission')).toBeNull();
  });

  it('turns away a login without manage_settings', async () => {
    mockSettings = settingsResponse({ is_admin: false, manage_settings: false, edit_capabilities: false });
    await render(<Hub />);
    expect(screen.getByText('Admins only')).toBeTruthy();
    expect(screen.queryByText('Receipts')).toBeNull();
  });
});

describe('a section save', () => {
  it('sends only its own changed keys', async () => {
    mockSettings = settingsResponse(ADMIN);
    mockSave.mockResolvedValue({ ok: true });
    await render(<ReceiptsScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Receipt number prefix'), 'S-');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save changes'));
    });
    expect(mockSave).toHaveBeenCalledWith({ receipt_prefix: 'S-' });
  });

  it('shows the stale sentence and offers their changes', async () => {
    mockSettings = settingsResponse(ADMIN);
    mockSave.mockResolvedValue({ ok: false, stale: true, message: 'Someone else changed these settings while you were editing.', fields: [] });
    await render(<CashScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Usual float'), '50');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save changes'));
    });
    expect(mockSave).toHaveBeenCalledWith({ default_float_pence: 5000 });
    expect(screen.getByText('Someone else changed these settings while you were editing.')).toBeTruthy();
    expect(screen.getByText('Use their changes')).toBeTruthy();
  });

  it('has no Save for a login that can only look', async () => {
    mockSettings = settingsResponse(ADMIN);
    (mockSettings as { can: unknown }).can = { is_admin: false, manage_settings: false, edit_capabilities: false };
    await render(<ReceiptsScreen />);
    expect(screen.queryByText('Save changes')).toBeNull();
  });
});

describe('tills', () => {
  it('switches a till off with its version and shows the open-session refusal', async () => {
    mockSettings = settingsResponse(ADMIN);
    mockTills = [
      { id: 't1', name: 'Front desk', has_cash_drawer: true, is_active: true, sort_order: 0, version: 3 },
      { id: 't2', name: 'Upstairs', has_cash_drawer: false, is_active: true, sort_order: 1, version: 1 },
    ];
    mockWrite.mockResolvedValue({
      ok: false,
      stale: false,
      status: 409,
      message: "Close this till's session before you stop using it.",
      fields: [{ path: 'is_active', message: "Close this till's session before you stop using it." }],
    });
    await render(<TillsScreen />);
    const switches = screen.getAllByLabelText('In use');
    await act(async () => {
      fireEvent(switches[0], 'valueChange', false);
    });
    expect(mockWrite).toHaveBeenCalledWith('/api/venue/pos/tills/t1', 'PATCH', { is_active: false, version: 3 });
    expect(screen.getByText("Close this till's session before you stop using it.")).toBeTruthy();
  });

  it('asks before adding a second till while one till is in use', async () => {
    mockSettings = settingsResponse(ADMIN, { multiple_tills_enabled: false });
    mockTills = [{ id: 't1', name: 'Front desk', has_cash_drawer: true, is_active: true, sort_order: 0, version: 3 }];
    await render(<TillsScreen />);
    expect(screen.getByText('You have one till, Front desk. Add another if you take money in more than one place.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Add another till'));
    });
    expect(screen.getByText('Add another till?')).toBeTruthy();
  });
});

describe('features', () => {
  it('asks before turning a feature off, then saves only that key', async () => {
    mockSettings = settingsResponse(ADMIN);
    mockSave.mockResolvedValue({ ok: false, stale: false, message: 'Close all tills before you switch this off.', fields: [] });
    await render(<FeaturesScreen />);
    await act(async () => {
      fireEvent(screen.getByLabelText('Count cash in till sessions'), 'valueChange', false);
    });
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.getByText('Turn off Count cash in till sessions?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Turn off'));
    });
    expect(mockSave).toHaveBeenCalledWith({ cash_management_enabled: false });
    expect(screen.getByText('Close all tills before you switch this off.')).toBeTruthy();
  });
});

describe('payment types', () => {
  it('removes a type with its version and says when it was switched off instead', async () => {
    mockSettings = settingsResponse(ADMIN);
    mockTypes = [{ id: 'p1', name: 'Bank transfer', requires_reference: false, is_active: true, sort_order: 0, version: 2 }];
    mockWrite.mockResolvedValue({ ok: true, body: { switched_off: true } });
    await render(<PaymentTypesScreen />);
    // Gift vouchers are on, so Paper voucher is not suggested.
    expect(screen.getByText('+ Card (another terminal)')).toBeTruthy();
    expect(screen.queryByText('+ Paper voucher')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Remove'));
    });
    await act(async () => {
      fireEvent.press(screen.getAllByText('Remove')[1]);
    });
    expect(mockWrite).toHaveBeenCalledWith('/api/venue/pos/payment-types/p1?version=2', 'DELETE');
    expect(mockToast.success).toHaveBeenCalledWith('Bank transfer is switched off.');
  });
});

describe('team permissions', () => {
  it('is for admins only', async () => {
    mockSettings = settingsResponse(STAFF);
    await render(<PermissionsScreen />);
    expect(screen.getByText('Only an admin can change this.')).toBeTruthy();
  });

  it('asks before using a preset and saves the whole map', async () => {
    mockSettings = settingsResponse(ADMIN);
    mockSave.mockResolvedValue({ ok: true });
    await render(<PermissionsScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Front desk'));
    });
    expect(screen.getByText('Use the Front desk permissions?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Use Front desk'));
    });
    expect(mockSave).toHaveBeenCalledWith({ staff_capabilities: expect.objectContaining({ refund: true, create_sale: true }) });
  });
});
