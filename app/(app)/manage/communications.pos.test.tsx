/**
 * Checkout messages on the Communications screen (web plan §4.23): the block shows only with
 * Checkout on, its switches save with the lanes through the same PUT as the `pos` block, and a
 * lanes-only save sends no `pos` at all (the server keeps the block a patch leaves out).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/lib/queries/useBillingStatus', () => ({ useBillingStatus: () => ({ data: undefined }) }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('@/components/manage/CommunicationPreviewSheet', () => ({ CommunicationPreviewSheet: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
  };
});
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

let mockPolicies: Record<string, unknown> = {};
const mockUpdatePolicies = jest.fn((_patch: unknown) => Promise.resolve({}));
jest.mock('@/lib/queries/useCommunications', () => ({
  useCommunicationPolicies: () => ({
    data: mockPolicies,
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useNotificationSettings: () => ({
    data: { daily_schedule_enabled: false, staff_new_booking_alert: false, staff_cancellation_alert: false },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useUpdateCommunicationPolicies: () => ({ mutateAsync: mockUpdatePolicies, isPending: false }),
  useUpdateNotificationSettings: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePreviewCommunication: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useUpdateVenue: () => ({ mutateAsync: jest.fn(() => Promise.resolve({})), isPending: false }),
}));

let mockResolved: Record<string, boolean> = {};
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: { current_user_role: 'admin', email: 'venue@example.com', pricing_tier: 'pro', feature_flags: { resolved: mockResolved } },
    featureFlags: { resolved: mockResolved },
    refetch: jest.fn(),
    isLoading: false,
    isError: false,
  }),
}));

import CommunicationsScreen from '@/app/(app)/manage/communications';

async function toggle(label: string, value: boolean) {
  await act(async () => {
    fireEvent(screen.getByLabelText(label), 'valueChange', value);
  });
}

async function save() {
  await act(async () => {
    fireEvent.press(screen.getByText('Save changes'));
  });
}

beforeEach(() => {
  mockUpdatePolicies.mockClear();
  mockPolicies = { appointments_other: {}, pos: { pos_refund_receipt: { enabled: false } } };
  mockResolved = { pos_enabled: true };
});

describe('Communications, Checkout messages', () => {
  it('is hidden while Checkout is off', async () => {
    mockResolved = { pos_gift_vouchers_enabled: true };
    await render(<CommunicationsScreen />);
    expect(screen.queryByText('Checkout messages')).toBeNull();
  });

  it('shows the stored switches, the voucher reminder only with vouchers on', async () => {
    await render(<CommunicationsScreen />);
    expect(screen.getByText('Checkout messages')).toBeTruthy();
    expect(screen.getByLabelText('Sale receipt').props.value).toBe(true);
    expect(screen.getByLabelText('Refund receipt').props.value).toBe(false);
    expect(screen.queryByText('Gift voucher expiry reminder')).toBeNull();
  });

  it('saves a switch through the policies PUT as the pos block only', async () => {
    mockResolved = { pos_enabled: true, pos_gift_vouchers_enabled: true };
    await render(<CommunicationsScreen />);
    await toggle('Gift voucher expiry reminder', false);
    await save();
    expect(mockUpdatePolicies).toHaveBeenCalledTimes(1);
    expect(mockUpdatePolicies).toHaveBeenCalledWith({
      pos: {
        pos_sale_receipt: { enabled: true },
        pos_refund_receipt: { enabled: false },
        voucher_expiry_reminder: { enabled: false },
      },
    });
  });

  it('a lanes-only save sends no pos block', async () => {
    await render(<CommunicationsScreen />);
    await toggle('Booking confirmation', false);
    await save();
    expect(mockUpdatePolicies).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePolicies.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch)).toEqual(['appointments_other']);
  });

  it('switching back to the saved value leaves nothing to save', async () => {
    await render(<CommunicationsScreen />);
    await toggle('Refund receipt', true);
    await toggle('Refund receipt', false);
    await save();
    expect(mockUpdatePolicies).not.toHaveBeenCalled();
  });
});
