/**
 * Web QA 2026-11-08 COM-F9: five push switches ("Waitlist offers", "Daily summary", "Reviews &
 * feedback", "Low SMS credit", "Billing & account") were shown and saved, but nothing ever sent
 * those pushes, so they were hidden. The owner then decided (8 November 2026) to build two of them:
 * "Billing & account" (a failed ResNeo payment, or the plan ending) and "Daily summary" (a morning
 * count of the day's bookings). Those two are back, "Billing & account" only for the people it is
 * sent to (the owner, and admins with "Billing, payouts and admins"); the other three stay hidden.
 * Unpaid-deposit alerts, and billing alerts, come through quiet hours, and the screen says so.
 *
 * jest hoists mock factories above imports, so every variable a factory closes over is `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/lib/push/notificationsModule', () => ({ Notifications: null }));
jest.mock('@/lib/push/registerDevice', () => ({ registerCurrentDeviceForPush: jest.fn() }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));
jest.mock('@/lib/queries/usePos', () => ({ usePosEnabled: () => false }));

let mockVenue: Record<string, unknown> | undefined;
jest.mock('@/lib/queries/useVenue', () => ({ useVenue: () => ({ data: mockVenue }) }));
jest.mock('@/lib/queries/useNotificationPreferences', () => ({
  useNotificationPreferences: () => ({ data: {}, isLoading: false, isError: false, refetch: jest.fn() }),
  useUpdateNotificationPreferences: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
  };
});

import NotificationPreferencesScreen from '@/app/(app)/manage/notification-preferences';

const OWNER = { current_user_role: 'admin', current_user_is_owner: true, current_user_billing_payouts_admins: true };
const ADMIN_WITHOUT_BILLING = { current_user_role: 'admin', current_user_is_owner: false, current_user_billing_payouts_admins: false };
const STAFF = { current_user_role: 'staff', current_user_is_owner: false, current_user_billing_payouts_admins: false };

describe('Push notifications: only switches something sends (COM-F9)', () => {
  beforeEach(() => {
    mockVenue = OWNER;
  });

  it('shows the alerts that are sent', async () => {
    await render(<NotificationPreferencesScreen />);
    for (const label of [
      'New bookings',
      'Cancellations',
      'Reschedules & changes',
      'Unpaid deposits',
      'No-show prompts',
      'Daily summary',
      'Billing & account',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('says what the Daily summary is and when it comes', async () => {
    await render(<NotificationPreferencesScreen />);
    expect(
      screen.getByText(
        'Each morning, how many bookings you have today and when the first starts. Sent at 7:30am, or when your quiet hours end if they run past then',
      ),
    ).toBeTruthy();
  });

  it('says what Billing & account is, and that it comes through quiet hours', async () => {
    await render(<NotificationPreferencesScreen />);
    expect(screen.getByText('When a ResNeo payment fails or your plan ends. These still come in quiet hours')).toBeTruthy();
    expect(screen.getByText(/Unpaid deposit and billing alerts still come through/)).toBeTruthy();
  });

  it.each([
    ['an admin without Billing, payouts and admins', ADMIN_WITHOUT_BILLING],
    ['a staff member', STAFF],
  ])('does not offer Billing & account to %s, who is never sent it', async (_who, venue) => {
    mockVenue = venue;
    await render(<NotificationPreferencesScreen />);
    expect(screen.queryByText('Billing & account')).toBeNull();
    expect(screen.getByText('Daily summary')).toBeTruthy();
    expect(screen.getByText(/Unpaid deposit alerts still come through/)).toBeTruthy();
  });

  it('keeps the switches nothing sends hidden', async () => {
    await render(<NotificationPreferencesScreen />);
    for (const label of ['Waitlist offers', 'Reviews & feedback', 'Low SMS credit']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('has no em-dash in any of its words', async () => {
    const { toJSON } = await render(<NotificationPreferencesScreen />);
    expect(JSON.stringify(toJSON())).not.toContain(String.fromCharCode(0x2014));
  });
});
