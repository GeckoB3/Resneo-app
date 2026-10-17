/**
 * The Checkout set-up wizard in the app (POS Part 4, owner decision OB2: the full wizard): each
 * screen's writes through Checkout settings' routes (design 6.4), the answers kept with the
 * progress, "Skip for now", resuming with earlier answers filled in, "Save and finish later", the
 * stamps when set-up starts and finishes, and who may open it.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SetupWizardScreen } from '@/components/pos/setup/SetupWizard';
import { ApiError } from '@/lib/api/client';
import { setupSettings, setupStatus, setupSteps, setupVenue } from '@/lib/pos/setup/test-fixtures';
import { onResponse } from '@/lib/pos/switches/test-fixtures';
import { queryKeys } from '@/lib/queries/keys';
import { settingsKeys } from '@/lib/queries/useCheckoutSettings';
import { setupKeys } from '@/lib/queries/usePosSetup';
import type { PosSetupProgressPatch, PosSetupScreen, PosSetupStatus } from '@/types/pos-setup';
import type { PosSwitchExtraKey } from '@/types/pos-switches';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'opened' })) }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismiss = jest.fn();
let mockRoutes: { name: string }[] = [];
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Stack: { Screen: () => null },
    useRouter: () => ({ push: mockPush, replace: mockReplace, dismiss: mockDismiss, back: jest.fn() }),
    useNavigation: () => ({ getState: () => ({ routes: mockRoutes }), addListener: () => () => undefined, dispatch: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useIsFocused: () => true,
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
let mockVenue: Record<string, unknown> = {};
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue, refetch: jest.fn(), terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
let mockRole = 'admin';
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { id: 'staff-1', role: mockRole } }, isLoading: false }),
}));
let mockPosOn = true;
let mockOperators: { kind: string; calendar_id: string | null; staff_id: string | null; name: string }[] = [];
jest.mock('@/lib/queries/usePos', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePos')>('@/lib/queries/usePos'),
  usePosEnabled: () => mockPosOn,
  usePosGate: () => ({ accessToken: 'token-A', enabled: true }),
  usePosBootstrap: () => ({ data: { settings: {}, capabilities: {}, operators: mockOperators } }),
}));
let mockStatus: unknown = null;
const mockSaveProgress = jest.fn();
const mockRefresh = jest.fn(async () => undefined);
jest.mock('@/lib/queries/usePosSetup', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePosSetup')>('@/lib/queries/usePosSetup'),
  usePosSetupStatus: () => ({ data: mockStatus, isError: false, refetch: jest.fn() }),
  useSaveSetupProgress: () => mockSaveProgress,
  useRefreshSetupStatus: () => mockRefresh,
  useCollectPhones: () => ({ data: { can_take_cards: true, phones: [{ staff_id: 'staff-2', name: 'Priya', devices: ['android'] }] } }),
  useReceiptPreview: () => ({ data: { practice: false, html: '', text: 'BLOOM HAIR STUDIO' }, isLoading: false, isError: false }),
}));
let mockSettings: unknown = null;
const mockSave = jest.fn();
const mockWrite = jest.fn();
let mockTypes: unknown[] = [];
jest.mock('@/lib/queries/useCheckoutSettings', () => {
  const actual = jest.requireActual<typeof import('@/lib/queries/useCheckoutSettings')>('@/lib/queries/useCheckoutSettings');
  return {
    ...actual,
    useCheckoutSettingsQuery: () => ({ data: mockSettings, isLoading: false, isError: false, refetch: jest.fn() }),
    useSaveCheckoutSettings: () => mockSave,
    useSettingsWrite: () => mockWrite,
    useSettingsPaymentTypes: () => ({ data: mockTypes, refetch: jest.fn() }),
  };
});
let mockSwitches: unknown = null;
const mockSetSwitch = jest.fn();
const mockApply = jest.fn();
jest.mock('@/lib/queries/useFeatureSwitches', () => ({
  useFeatureSwitches: () => ({ data: mockSwitches, isLoading: false }),
  useSetFeatureSwitch: () => ({ mutateAsync: mockSetSwitch, isPending: false }),
  applySwitchResult: (...args: unknown[]) => mockApply(...args),
}));
const mockUpdateVenue = jest.fn();
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useUpdateVenue: () => ({ mutateAsync: mockUpdateVenue, mutate: mockUpdateVenue, isPending: false }),
}));
jest.mock('@/lib/queries/useBillingStatus', () => ({
  useStripeConnect: () => ({ data: { connected: true, charges_enabled: true, details_submitted: true }, isLoading: false, refetch: jest.fn() }),
  useStripeConnectLink: () => ({ mutate: jest.fn(), isPending: false }),
}));
let mockStaffList: unknown = { staff: [{ id: 'staff-1', role: 'admin' }, { id: 'staff-2', role: 'staff' }] };
jest.mock('@/lib/queries/useStaffList', () => ({ useStaffList: () => ({ data: mockStaffList }) }));
const mockSaveProduct = jest.fn();
jest.mock('@/lib/queries/useRetail', () => ({
  useRetailProducts: () => ({ data: { pages: [{ total: 0, items: [] }] }, refetch: jest.fn() }),
  useSaveProduct: () => ({ mutateAsync: mockSaveProduct, isPending: false }),
}));
const mockQueries: Record<string, unknown> = {};
const mockSend = jest.fn();
jest.mock('@/lib/pos/settings-more/hooks', () => ({
  ...jest.requireActual<typeof import('@/lib/pos/settings-more/hooks')>('@/lib/pos/settings-more/hooks'),
  useSettingsQuery: (_key: unknown, path: string) => ({ data: mockQueries[path], isError: false, refetch: jest.fn() }),
  useSettingsSend: () => mockSend,
}));
const mockPut = jest.fn();
jest.mock('@/components/pos/settings-more/loyalty/useLoyaltyPut', () => ({ useLoyaltyPut: () => mockPut }));
const mockOpenPractice = jest.fn();
jest.mock('@/components/pos/practice/api', () => ({
  useOpenPracticeSale: () => ({ open: mockOpenPractice, opening: false, error: null }),
}));
let mockAiOffered = false;
jest.mock('@/components/retail/ai-import/api', () => ({
  useProductsAiAvailability: () => ({ offered: mockAiOffered, loading: false }),
}));
jest.mock('@/components/retail/ai-import/ProductsAiEntry', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ProductsAiEntry: () => React.createElement(Text, null, 'Add with AI') };
});


let client: QueryClient;

async function show(screenName: PosSetupScreen, missed: PosSwitchExtraKey[] = []) {
  client.setQueryData(setupKeys.status('token-A'), mockStatus);
  client.setQueryData(settingsKeys.settings('token-A'), mockSettings);
  client.setQueryData(queryKeys.venue.bootstrap('token-A'), mockVenue);
  await render(
    <QueryClientProvider client={client}>
      <SetupWizardScreen screen={screenName} missed={missed} />
    </QueryClientProvider>,
  );
}

async function press(text: string | RegExp) {
  await act(async () => {
    fireEvent.press(typeof text === 'string' ? screen.getByText(text) : screen.getByText(text));
  });
}

async function type(label: string, value: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(label), value);
  });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  [mockPush, mockReplace, mockDismiss, mockSaveProgress, mockSave, mockWrite, mockSetSwitch, mockApply, mockUpdateVenue, mockSaveProduct, mockSend, mockPut, mockOpenPractice].forEach((m) =>
    m.mockReset(),
  );
  mockToast.error.mockClear();
  mockToast.success.mockClear();
  mockRole = 'admin';
  mockPosOn = true;
  mockAiOffered = false;
  mockOperators = [];
  mockRoutes = [{ name: '(tabs)' }, { name: 'today' }, { name: 'checkout-setup/[step]' }];
  mockStatus = setupStatus();
  mockSettings = setupSettings();
  mockVenue = setupVenue();
  mockTypes = [];
  mockSwitches = onResponse();
  mockStaffList = { staff: [{ id: 'staff-1', role: 'admin' }, { id: 'staff-2', role: 'staff' }] };
  for (const key of Object.keys(mockQueries)) delete mockQueries[key];
  mockSaveProgress.mockImplementation(async (patch: Omit<PosSetupProgressPatch, 'version'>) => {
    const before = mockStatus as PosSetupStatus;
    return { ok: true, status: { ...before, version: before.version + 1, answers: { ...before.answers, ...patch.answers } } };
  });
  mockSave.mockResolvedValue({ ok: true });
  mockWrite.mockResolvedValue({ ok: true, body: {} });
  mockUpdateVenue.mockResolvedValue({});
});

describe('who may open it', () => {
  it('turns away a team member', async () => {
    mockRole = 'staff';
    mockVenue = setupVenue({ current_user_role: 'staff' });
    await show('welcome');
    expect(screen.getByText('Admins only')).toBeTruthy();
    expect(screen.queryByText("Let's go")).toBeNull();
  });

  it('says Checkout is off, keeping the answers, when it was switched off midway', async () => {
    mockPosOn = false;
    await show('tips');
    expect(screen.getByText('Checkout is off')).toBeTruthy();
    expect(screen.getByText('Your answers are kept. Switch Checkout back on to carry on setting it up.')).toBeTruthy();
  });
});

describe('W0, welcome', () => {
  it('stamps the start once, says what is ready, and goes on or leaves', async () => {
    mockStatus = setupStatus({ started_at: null });
    await show('welcome', ['pos_loyalty_enabled']);
    expect(mockSaveProgress).toHaveBeenCalledTimes(1);
    expect(mockSaveProgress).toHaveBeenCalledWith({ started: true });
    expect(screen.getByText("Let's get Checkout ready")).toBeTruthy();
    expect(screen.getByText('Stripe is connected')).toBeTruthy();
    expect(screen.getByText('Your business details are ready from your profile')).toBeTruthy();
    expect(screen.getByText(/couldn't switch on loyalty card/)).toBeTruthy();
    expect(screen.getByText('Step 1 of 9')).toBeTruthy();
    await press("Let's go");
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/use');
    await press("I'll do it later");
    expect(mockDismiss).toHaveBeenCalledWith(1);
  });

  it('does not stamp the start again', async () => {
    await show('welcome');
    expect(mockSaveProgress).not.toHaveBeenCalled();
  });
});

describe('W1, what Checkout is for', () => {
  it('turns "Sell products" off, switches a ticked extra on, keeps the answer and moves on', async () => {
    mockSwitches = onResponse({ switches: { pos_gift_vouchers_enabled: { version: 4 } } });
    const after = onResponse({ switches: { pos_gift_vouchers_enabled: { effective: true, version: 5 } } });
    mockSetSwitch.mockResolvedValue({ ok: true, switches: after });
    await show('use');
    expect(screen.getByText('Always included')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Sell products\./));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Sell gift vouchers\./));
    });
    await press('Continue');
    expect(mockSave).toHaveBeenCalledWith({ sell_products_enabled: false });
    expect(mockSetSwitch).toHaveBeenCalledWith(expect.objectContaining({ feature: 'pos_gift_vouchers_enabled', on: true, version: 4 }));
    expect(mockApply).toHaveBeenCalledWith(expect.anything(), 'token-A', after);
    expect(mockSaveProgress).toHaveBeenCalledWith({ answers: { use: { products: false, vouchers: true, loyalty: false, shop: false } } });
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/pay');
  });

  it('names an extra that did not come on, and carries on', async () => {
    mockSetSwitch.mockRejectedValue(new Error('Refused'));
    await show('use');
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Run a loyalty card\./));
    });
    await press('Continue');
    expect(mockToast.error).toHaveBeenCalledWith("We couldn't switch on loyalty card. You can try again in Checkout settings.");
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/pay');
  });

  it('keeps "Sell products" ticked while the shop is ticked, and gives the owner\'s choice back when it is unticked', async () => {
    mockSwitches = onResponse({ switches: { pos_online_shop_enabled: { offered: true, can_switch_on: true, unavailable_reason: null, version: 2 } } });
    const after = onResponse({ switches: { pos_online_shop_enabled: { effective: true, version: 3 } } });
    mockSetSwitch.mockResolvedValue({ ok: true, switches: after });
    await show('use');
    // The owner says no products, then ticks the shop: products stay ticked, fixed, with the reason.
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Sell products\./));
    });
    expect(screen.getByLabelText(/^Sell products\./).props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Sell products online\./));
    });
    expect(screen.getByText('Your online shop sells products, so this stays ticked.')).toBeTruthy();
    const products = screen.getByLabelText(/^Sell products\. Your online shop/);
    expect(products.props.accessibilityState).toEqual(expect.objectContaining({ checked: true, disabled: true }));
    // Unticked again: the owner's own choice is back.
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Sell products online\./));
    });
    expect(screen.getByLabelText(/^Sell products\. Shampoo/).props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    // Ticked once more and saved: "Sell products" goes as on (products || shop), the shop comes on.
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Sell products online\./));
    });
    await press('Continue');
    expect(mockSave).not.toHaveBeenCalledWith({ sell_products_enabled: false });
    expect(mockSetSwitch).toHaveBeenCalledWith(expect.objectContaining({ feature: 'pos_online_shop_enabled', on: true, version: 2 }));
    expect(mockSaveProgress).toHaveBeenCalledWith({ answers: { use: { products: true, vouchers: false, loyalty: false, shop: true } } });
  });

  it('keeps "Sell products" ticked and fixed while the shop is on already', async () => {
    mockSwitches = onResponse({ switches: { pos_online_shop_enabled: { effective: true, offered: true } } });
    await show('use');
    expect(screen.getByText('Your online shop sells products, so this stays ticked.')).toBeTruthy();
    expect(screen.getByLabelText(/^Sell products\. Your online shop/).props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true, disabled: true }),
    );
  });

  it('shows an extra already on as ticked, fixed', async () => {
    mockSwitches = onResponse({ switches: { pos_gift_vouchers_enabled: { effective: true } } });
    await show('use');
    expect(screen.getByText('Already on. You can switch it off in Checkout settings.')).toBeTruthy();
  });
});

describe('W2, how clients pay', () => {
  beforeEach(() => {
    mockTypes = [
      { id: 'pt-card', name: 'Card (another terminal)', requires_reference: false, is_active: true, sort_order: 0, version: 2 },
      { id: 'pt-bank', name: 'Bank transfer', requires_reference: false, is_active: true, sort_order: 1, version: 3 },
    ];
  });

  it('switches off a payment type not ticked, turns on cash counting with the float, and goes to cards', async () => {
    await show('pay');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Bank transfer'));
    });
    await press('Yes, help me count it');
    await type('Usual float (optional)', '50');
    await press('Continue');
    expect(mockWrite).toHaveBeenCalledWith('/api/venue/pos/payment-types/pt-bank', 'PATCH', { is_active: false, version: 3 });
    expect(mockSave).toHaveBeenCalledWith({ cash_management_enabled: true, default_float_pence: 5000 });
    expect(mockSaveProgress).toHaveBeenCalledWith({
      answers: { pay: { card: true, cash: true, transfer: false, other_machine: true, count_cash: true, float_pence: 5000 } },
    });
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/cards');
  });

  it("stops on the server's sentence and stays", async () => {
    mockSave.mockResolvedValue({ ok: false, stale: false, message: 'Close all tills before you switch this off.', fields: [] });
    mockSettings = setupSettings({ cash_management_enabled: true });
    await show('pay');
    await press('No, just record it');
    await press('Continue');
    expect(screen.getByText('Close all tills before you switch this off.')).toBeTruthy();
    expect(mockSaveProgress).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('skips without writing anything', async () => {
    await show('pay');
    await press('Skip for now');
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/cards');
  });
});

describe('W3, taking cards', () => {
  it('turns card payments in person on for a phone, lists the team, and keeps the answer', async () => {
    await show('cards');
    expect(screen.getByText('Stripe is connected. Card payments go straight to your own account.')).toBeTruthy();
    await press('On my phone');
    expect(mockUpdateVenue).toHaveBeenCalledWith({ in_person_payments_enabled: true });
    expect(screen.getByText('This also lets your team take card payments in the ResNeo app.')).toBeTruthy();
    expect(screen.getByText("Priya's Android phone is ready to take cards")).toBeTruthy();
    await press('Get this phone ready');
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/phone');
    await press('Continue');
    expect(mockSaveProgress).toHaveBeenCalledWith({ answers: { cards: 'phone' } });
    expect(mockPush).toHaveBeenLastCalledWith('/checkout-setup/tips');
  });

  it("shows a reader's pairing steps and opens Checkout settings' card readers", async () => {
    mockVenue = setupVenue({ in_person_payments_enabled: true });
    await show('cards');
    await press('A counter card reader');
    expect(mockUpdateVenue).not.toHaveBeenCalled();
    await press('Add a card reader');
    expect(mockPush).toHaveBeenCalledWith('/checkout-settings/card-readers');
  });

  it('marks the step skipped and moves on', async () => {
    await show('cards');
    await press('Skip for now');
    expect(mockSaveProgress).toHaveBeenCalledWith({ step: { id: 'cards', state: 'skipped' } });
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/tips');
  });
});

describe('W4, tips', () => {
  it('turns tips on with the sharing rule and the template policy', async () => {
    mockOperators = [
      { kind: 'calendar', calendar_id: 'c1', staff_id: null, name: 'Sam' },
      { kind: 'calendar', calendar_id: 'c2', staff_id: null, name: 'Priya' },
    ];
    await show('tips');
    await press('Yes');
    await press('Equally between the people who did the services');
    await press('Continue');
    expect(mockSave).toHaveBeenCalledWith({
      tipping_enabled: true,
      tip_allocation_rule: 'equal_performers',
      tipping_policy: expect.stringContaining('Tipping policy at Bloom Hair Studio'),
    });
    expect(mockSaveProgress).toHaveBeenCalledWith({ answers: { tips: 'yes' } });
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/details');
  });

  it('tells a one-person business tips go to them', async () => {
    await show('tips');
    await press('Yes');
    expect(screen.getByText('Tips go to you.')).toBeTruthy();
    expect(screen.queryByText('How should tips be shared?')).toBeNull();
  });

  it('opens with the earlier answer filled in, and says what "Not sure yet" does', async () => {
    mockStatus = setupStatus({ answers: { tips: 'unsure' } });
    await show('tips');
    expect(screen.getByLabelText('Not sure yet').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(screen.getByText("We'll leave tips off. You can turn them on later in Checkout settings.")).toBeTruthy();
  });

  it('sends a skipped step back to "to do" once answered', async () => {
    mockStatus = setupStatus({ steps: setupSteps({ tips: { state: 'skipped' } }) });
    await show('tips');
    await press('No');
    await press('Continue');
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSaveProgress).toHaveBeenCalledWith({ answers: { tips: 'no' }, step: { id: 'tips', state: 'todo' } });
  });
});

describe('W5, details for receipts (OB5)', () => {
  it("edits the profile's values, keeps a receipt-only name, and suggests emailing receipts", async () => {
    await show('details');
    expect(screen.getByText('This also changes your booking page.')).toBeTruthy();
    expect(screen.getByDisplayValue('hello@bloom.example')).toBeTruthy();
    await type('Email for clients', 'desk@bloom.example');
    await act(async () => {
      fireEvent(screen.getByLabelText('Show different details on receipts'), 'valueChange', true);
    });
    await type('Name on receipts', 'Bloom Ltd');
    await press('Continue');
    expect(mockUpdateVenue).toHaveBeenCalledWith({ email: 'desk@bloom.example' });
    expect(mockSave).toHaveBeenCalledWith({ trading_name: 'Bloom Ltd', receipt_auto_send: 'email_if_known' });
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/products');
  });

  it('asks for the VAT number and rates only once VAT registered', async () => {
    await show('details');
    expect(screen.queryByLabelText('VAT number')).toBeNull();
    await press('Yes');
    await type('VAT number', 'GB123456789');
    await press('Continue');
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ vat_registered: true, vat_number: 'GB123456789' }));
  });

  it('previews a receipt', async () => {
    await show('details');
    await press('Preview a receipt');
    expect(screen.getByText("This is what your client's receipt looks like.")).toBeTruthy();
    expect(screen.getByText('BLOOM HAIR STUDIO')).toBeTruthy();
  });
});

describe('W6, the team', () => {
  beforeEach(() => {
    mockStatus = setupStatus({ steps: setupSteps({ team: { applies: true } }) });
    mockOperators = [
      { kind: 'calendar', calendar_id: 'c1', staff_id: null, name: 'Sam' },
      { kind: 'calendar', calendar_id: 'c2', staff_id: null, name: 'Priya' },
    ];
    mockSend.mockImplementation(async (_path: string, method: string) => (method === 'GET' ? { today: '2026-10-11', rates: [] } : {}));
  });

  it("saves the Front desk preset's map and adds commission for services and products from today", async () => {
    await show('team');
    await press('Front desk');
    await press('Yes');
    await type('On services', '10');
    await type('On products', '15');
    await press('Continue');
    expect(mockSave).toHaveBeenCalledWith({ staff_capabilities: expect.objectContaining({ refund: true, override_price: true }) });
    expect(mockSend).toHaveBeenCalledWith('/api/venue/pos/commission/rates', 'POST', expect.objectContaining({ item_type: 'service', rate_percent: 10, effective_from: '2026-10-11' }));
    expect(mockSend).toHaveBeenCalledWith('/api/venue/pos/commission/rates', 'POST', expect.objectContaining({ item_type: 'product', rate_percent: 15 }));
    expect(mockSaveProgress).toHaveBeenCalledWith({ answers: { team: { preset: 'front_desk', commission: true } } });
  });

  it('asks about permissions only with team logins', async () => {
    mockStaffList = { staff: [{ id: 'staff-1', role: 'admin' }] };
    await show('team');
    expect(screen.queryByText('Front desk')).toBeNull();
    expect(screen.getByText('Do you pay your team commission?')).toBeTruthy();
  });
});

describe('W7, products', () => {
  it('adds a few products, rows with one name becoming options, then turns on stock counting', async () => {
    await show('products');
    await type('Name', 'Repair Shampoo');
    await type('Size or shade (optional)', '250 ml');
    await type('Price', '18.50');
    mockSaveProduct.mockResolvedValue({ id: 'p1' });
    await press('Add 1 product');
    expect(mockSaveProduct).toHaveBeenCalledWith({
      kind: 'create',
      clientRequestId: expect.any(String),
      body: {
        name: 'Repair Shampoo',
        usage: 'retail',
        sold_in_store: true,
        variants: [{ option_name: '250 ml', price_pence: 1850, sort_order: 0, barcodes: [] }],
      },
    });
    expect(mockToast.success).toHaveBeenCalledWith('1 product added. You can sell it at the till now.');
    await press('Yes, count my stock');
    await press('Continue');
    expect(mockSave).toHaveBeenCalledWith({ track_stock_enabled: true });
    expect(mockWrite).toHaveBeenCalledWith('/api/venue/retail/stock/track-all', 'POST');
    expect(mockSaveProgress).toHaveBeenCalledWith({ answers: { track_stock: true } });
    expect(mockPush).toHaveBeenLastCalledWith('/checkout-setup/practice');
  });

  it('while the online shop is on, puts the products added here in it too, unless unticked', async () => {
    mockVenue = setupVenue({ resolved: { pos_online_shop_enabled: true } });
    mockSaveProduct.mockResolvedValue({ id: 'p1' });
    await show('products');
    expect(screen.getByText('You can change this for each product later.')).toBeTruthy();
    await type('Name', 'Sea Salt Spray');
    await type('Price', '16');
    await press('Add 1 product');
    expect(mockSaveProduct).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ name: 'Sea Salt Spray', sold_online: true }) }),
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Sell these in my online shop too/));
    });
    await type('Name', 'Wide Comb');
    await type('Price', '4');
    await press('Add 1 product');
    expect(mockSaveProduct).toHaveBeenLastCalledWith(expect.objectContaining({ body: expect.not.objectContaining({ sold_online: true }) }));
  });

  it('offers no online tick while the shop is off', async () => {
    await show('products');
    expect(screen.queryByText('Sell these in my online shop too')).toBeNull();
  });

  it('says what a row is missing', async () => {
    await show('products');
    await type('Name', 'Wax');
    await type('Price', 'cheap');
    await press('Add 1 product');
    expect(mockSaveProduct).not.toHaveBeenCalled();
    expect(screen.getAllByText('Enter a price, like 12.50.').length).toBeGreaterThan(0);
  });

  it("opens the app's own spreadsheet import, and offers AI only while the server does", async () => {
    await show('products');
    expect(screen.getByText('Import a spreadsheet')).toBeTruthy();
    await press('Import from a CSV file');
    expect(mockPush).toHaveBeenCalledWith('/stock/import');
    expect(screen.queryByText('Photograph your shelves or a price list')).toBeNull();
    mockAiOffered = true;
    await show('products');
    expect(screen.getByText('Photograph your shelves or a price list')).toBeTruthy();
    expect(screen.getByText('Add with AI')).toBeTruthy();
  });

  it('"I\'ll add products later" skips it', async () => {
    await show('products');
    await press("I'll add products later");
    expect(mockSaveProgress).toHaveBeenCalledWith({ step: { id: 'products', state: 'skipped' } });
  });
});

describe('W8, gift vouchers', () => {
  it('saves every setting the first time, with our terms', async () => {
    mockQueries['/api/venue/pos/voucher-settings'] = {
      settings: {
        preset_pence: [2500, 5000, 7500, 10000],
        custom_allowed: true,
        min_pence: 1000,
        max_pence: 50000,
        expiry_months: 12,
        terms: null,
        online_sale_enabled: false,
        accent_colour: null,
        version: 0,
        set_up: false,
      },
      venue: { name: 'Bloom Hair Studio', currency: 'GBP', card_payments_ready: true, slug: 'bloom' },
    };
    mockSend.mockResolvedValue({});
    await show('vouchers');
    expect(screen.getByText('Let buyers choose another amount between £10 and £500')).toBeTruthy();
    await press('Continue');
    expect(mockSend).toHaveBeenCalledWith(
      '/api/venue/pos/voucher-settings',
      'PATCH',
      expect.objectContaining({
        preset_pence: [2500, 5000, 7500, 10000],
        expiry_months: 12,
        terms: expect.stringContaining('Gift vouchers at Bloom Hair Studio'),
        online_sale_enabled: false,
        version: 0,
      }),
    );
  });
});

describe('W9, the loyalty card', () => {
  beforeEach(() => {
    mockQueries['/api/venue/pos/loyalty/programme'] = {
      programme: {
        id: null,
        name: 'Loyalty card',
        stamps_needed: 6,
        qualifying_service_item_ids: null,
        reward_kind: 'free_service',
        reward_service_item_ids: null,
        reward_amount_pence: null,
        reward_percent_bps: null,
        reward_valid_days: null,
        started_on: '2026-10-11',
        status: 'active',
        reward_email_enabled: true,
        version: 0,
        set_up: false,
      },
      services: [{ id: 's1', name: 'Blow-dry', price_pence: 2800 }],
      today: '2026-10-11',
    };
    mockPut.mockResolvedValue({});
  });

  it('asks for the free service, then saves the card starting today', async () => {
    await show('loyalty');
    await press('Continue');
    expect(screen.getByText('Choose the free service.')).toBeTruthy();
    expect(mockPut).not.toHaveBeenCalled();
    await press('Blow-dry');
    await press('Continue');
    expect(mockPut).toHaveBeenCalledWith(
      expect.objectContaining({
        stamps_needed: 6,
        reward_kind: 'free_service',
        reward_service_item_ids: ['s1'],
        qualifying_service_item_ids: null,
        started_on: '2026-10-11',
        version: 0,
      }),
    );
  });
});

describe('W10, the online shop', () => {
  const SHOP = '/api/venue/shop/settings';
  const TEMPLATES = {
    returns: 'Returns at Bloom Hair Studio. Email hello@bloom.example within 30 days.',
    cancellation: 'You can cancel within 14 days of receiving your order.',
    delivery: 'We deliver across the UK.',
    terms: 'These terms are between you and Bloom Hair Studio.',
  };
  const POLICIES = {
    returns_policy: TEMPLATES.returns,
    cancellation_policy: TEMPLATES.cancellation,
    delivery_policy: TEMPLATES.delivery,
    terms_of_sale: TEMPLATES.terms,
  };
  type Checks = { legal: boolean; policies: boolean; cards: boolean; plan: boolean; products: boolean; fulfilment: boolean };
  function shopView(over: { checks?: Partial<Checks>; settings?: Record<string, unknown> } = {}) {
    const checks: Checks = { legal: true, policies: false, cards: true, plan: true, products: false, fulfilment: true, ...over.checks };
    const settings: Record<string, unknown> = {
      shop_open: false,
      returns_policy: null,
      cancellation_policy: null,
      delivery_policy: null,
      terms_of_sale: null,
      version: 5,
      ...over.settings,
    };
    const canOpen = Object.values(checks).every(Boolean);
    return {
      settings,
      readiness: { checks, canOpen, open: canOpen && settings.shop_open === true, placeholders: [] },
      templates: TEMPLATES,
      shop_url: 'https://reserve-ni.example/shop/bloom',
      zones: [],
    };
  }
  const yes = () => screen.getByLabelText(/^Yes, open my shop\./);
  const notYet = () => screen.getByLabelText(/^Not yet\./);

  it("shows the shop's checklist, opens its settings, says where to open it later, and Skip skips", async () => {
    mockQueries[SHOP] = shopView();
    await show('shop');
    expect(screen.getByText('Card payments set up')).toBeTruthy();
    await press('Set up my shop');
    expect(mockPush).toHaveBeenCalledWith('/checkout-settings/shop');
    // No product sells online yet, so the shop cannot open from here.
    expect(yes().props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(screen.getByText('You can choose this once everything above is ticked.')).toBeTruthy();
    expect(notYet().props.accessibilityState).toEqual({ checked: true, disabled: false });
    expect(screen.getByText('You can open your shop any time in Checkout settings, Online shop.')).toBeTruthy();
    await press('Skip for now');
    expect(mockSaveProgress).toHaveBeenCalledWith({ step: { id: 'shop', state: 'skipped' } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('opens the shop, writing the policies from our templates in the same save', async () => {
    mockQueries[SHOP] = shopView({ checks: { products: true } });
    mockSend.mockResolvedValue(shopView({ checks: { products: true, policies: true }, settings: { ...POLICIES, shop_open: true, version: 6 } }));
    await show('shop');
    expect(screen.getByText("Use our templates for your shop's policies")).toBeTruthy();
    expect(yes().props.accessibilityState).toEqual({ checked: true, disabled: false });
    expect(screen.getByText('Customers can order from your shop as soon as you continue.')).toBeTruthy();
    await press('Continue');
    expect(mockSend).toHaveBeenCalledWith(SHOP, 'PATCH', { ...POLICIES, shop_open: true, version: 5 });
    expect(mockToast.success).toHaveBeenCalledWith('Your shop is open.');
    expect(mockPush).toHaveBeenLastCalledWith('/checkout-setup/practice');
  });

  it('"Not yet" keeps the templates and leaves the shop shut', async () => {
    mockQueries[SHOP] = shopView({ checks: { products: true } });
    mockSend.mockResolvedValue(shopView({ checks: { products: true, policies: true }, settings: { ...POLICIES, version: 6 } }));
    await show('shop');
    await act(async () => {
      fireEvent.press(notYet());
    });
    expect(yes().props.accessibilityState).toEqual({ checked: false, disabled: false });
    await press('Continue');
    expect(mockSend).toHaveBeenCalledWith(SHOP, 'PATCH', { ...POLICIES, version: 5 });
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenLastCalledWith('/checkout-setup/practice');
  });

  it('unticking the templates leaves the policies to write, so nothing is saved and the shop stays shut', async () => {
    mockQueries[SHOP] = shopView({ checks: { products: true } });
    await show('shop');
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Use our templates for your shop's policies/));
    });
    expect(yes().props.accessibilityState).toEqual({ checked: false, disabled: true });
    await press('Continue');
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenLastCalledWith('/checkout-setup/practice');
  });

  it("shows the server's refusal and stays", async () => {
    mockQueries[SHOP] = shopView({ checks: { products: true } });
    const sentence = 'Add these before you open your shop: card payments.';
    mockSend.mockRejectedValue(new ApiError(sentence, 409, { error: sentence, code: 'SHOP_LEGAL_DETAILS_MISSING' }));
    await show('shop');
    await press('Continue');
    expect(screen.getByText(sentence)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('once the shop is open, says so and goes on without asking or saving', async () => {
    mockQueries[SHOP] = shopView({ checks: { products: true, policies: true }, settings: { ...POLICIES, shop_open: true } });
    await show('shop');
    expect(screen.getByText('Your shop is open.')).toBeTruthy();
    expect(screen.queryByText('Open your shop now?')).toBeNull();
    expect(screen.queryByText('Skip for now')).toBeNull();
    await press('Continue');
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenLastCalledWith('/checkout-setup/practice');
  });
});

describe('W11, a practice sale', () => {
  it("starts a practice sale through the practice sale's own starter", async () => {
    await show('practice');
    await press('Start a practice sale');
    expect(mockOpenPractice).toHaveBeenCalledTimes(1);
  });

  it('says the practice was cleared away once done, and goes on', async () => {
    mockStatus = setupStatus({ steps: setupSteps({ practice: { state: 'done' } }) });
    await show('practice');
    expect(screen.getByText("That's it. Your practice sale has been cleared away.")).toBeTruthy();
    await press('Continue');
    expect(mockPush).toHaveBeenCalledWith('/checkout-setup/done');
  });
});

describe('W12, Checkout is ready', () => {
  it('stamps the finish once, sums up, and opens Checkout once set-up is left', async () => {
    mockStatus = setupStatus({ steps: setupSteps({ cards: { state: 'done' }, tips: { state: 'done' } }) });
    mockRoutes = [{ name: '(tabs)' }, { name: 'today' }, { name: 'checkout-setup/[step]' }, { name: 'checkout-setup/[step]' }];
    await show('done');
    expect(mockSaveProgress).toHaveBeenCalledWith({ finished: true });
    expect(screen.getByText('Cards in person')).toBeTruthy();
    expect(screen.getByText('No tips for now')).toBeTruthy();
    expect(screen.getByText('Add your products')).toBeTruthy();
    expect(screen.getByText("Or mark the client as Arrived. They'll wait for you in Ready to pay.")).toBeTruthy();
    await press('Open Checkout');
    expect(mockDismiss).toHaveBeenCalledWith(2);
    expect(mockPush).toHaveBeenCalledWith('/checkout');
  });

  it('does not open Checkout twice when set-up was opened from it', async () => {
    mockStatus = setupStatus({ finished_at: '2026-10-11T10:00:00Z' });
    mockRoutes = [{ name: '(tabs)' }, { name: 'checkout/index' }, { name: 'checkout-setup/[step]' }];
    await show('done');
    expect(mockSaveProgress).not.toHaveBeenCalled();
    await press('Open Checkout');
    expect(mockDismiss).toHaveBeenCalledWith(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('Save and finish later', () => {
  it("leaves every screen of the wizard at once, back to where set-up was opened", async () => {
    mockRoutes = [{ name: '(tabs)' }, { name: 'today' }, { name: 'checkout-setup/[step]' }, { name: 'checkout-setup/[step]' }, { name: 'checkout-setup/[step]' }];
    await show('tips');
    await press('Save and finish later');
    expect(mockDismiss).toHaveBeenCalledWith(3);
  });
});
