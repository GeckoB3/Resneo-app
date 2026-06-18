/**
 * Communications-15 (High): the venue "New booking alert" owner-email card.
 *
 * Mirrors the web `CommunicationTemplatesSection` "Business notifications → New
 * booking alert" card. This exercises the two behaviours the audit calls out:
 *  - email validation GATES the save (an invalid recipient blocks the PATCH;
 *    a valid one — or a cleared field — allows it), and
 *  - the PATCH body sent via `useUpdateVenue` carries exactly the changed
 *    `{ owner_booking_notification_enabled, owner_booking_notification_email }`
 *    fields, with an empty email normalised to `null` (server falls back to the
 *    venue profile email).
 *
 * jest hoists mock factories above imports, so every variable a factory closes
 * over is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// Stack.Screen reads a navigator route via useRoute — stub it to render nothing.
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
}));

// The preview sheet pulls in a WebView-ish surface; it's irrelevant here.
jest.mock('@/components/manage/CommunicationPreviewSheet', () => ({
  CommunicationPreviewSheet: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

// --- Communication hooks: return ready data so the screen renders past its
//     loading skeleton (it gates on policiesQuery.data && settingsQuery.data). --
const mockNotificationSettings = {
  daily_schedule_enabled: false,
  staff_new_booking_alert: false,
  staff_cancellation_alert: false,
};
jest.mock('@/lib/queries/useCommunications', () => ({
  useCommunicationPolicies: () => ({
    data: { appointments_other: {} },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useNotificationSettings: () => ({
    data: mockNotificationSettings,
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useUpdateCommunicationPolicies: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateNotificationSettings: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePreviewCommunication: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

// --- The owner-alert PATCH mutation (useUpdateVenue). ------------------------
const mockUpdateVenueAsync = jest.fn(() => Promise.resolve({}));
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useUpdateVenue: () => ({ mutateAsync: mockUpdateVenueAsync, isPending: false }),
}));

// --- VenueProvider: admin venue with the owner-alert OFF and no recipient. ---
const mockRefetchVenue = jest.fn();
let mockVenue: {
  current_user_role: string;
  email: string | null;
  owner_booking_notification_enabled?: boolean;
  owner_booking_notification_email?: string | null;
  pricing_tier?: string | null;
  stripe_connected_account_id?: string | null;
};
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: mockVenue,
    featureFlags: { resolved: {} },
    refetch: mockRefetchVenue,
    isLoading: false,
    isError: false,
  }),
}));

import CommunicationsScreen from '@/app/(app)/manage/communications';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

async function changeText(node: Parameters<typeof fireEvent.changeText>[0], value: string) {
  await act(async () => {
    fireEvent.changeText(node, value);
  });
}

async function toggle(node: Parameters<typeof fireEvent>[0], value: boolean) {
  await act(async () => {
    fireEvent(node, 'valueChange', value);
  });
}

beforeEach(() => {
  mockUpdateVenueAsync.mockClear();
  mockRefetchVenue.mockClear();
  mockVenue = {
    current_user_role: 'admin',
    email: 'venue@example.com',
    owner_booking_notification_enabled: false,
    owner_booking_notification_email: null,
    pricing_tier: 'pro',
    stripe_connected_account_id: 'acct_1',
  };
});

describe('Communications — New booking alert (owner email)', () => {
  it('renders the Business notifications card; the email field is hidden until enabled', async () => {
    await render(<CommunicationsScreen />);

    expect(screen.getByText('Business notifications')).toBeTruthy();
    expect(screen.getByText('New booking alert')).toBeTruthy();
    // Recipient field only shows once the alert is enabled.
    expect(screen.queryByText('Notification email')).toBeNull();
  });

  it('shows the recipient field with a validation error and blocks save for a bad email', async () => {
    await render(<CommunicationsScreen />);

    // Enable the alert → recipient field appears.
    await toggle(screen.getByLabelText('New booking alert'), true);
    expect(screen.getByText('Notification email')).toBeTruthy();

    // Type an invalid address → inline error, Save remains blocked.
    await changeText(screen.getByPlaceholderText('venue@example.com'), 'not-an-email');
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();

    await press(() => screen.getByText('Save changes'));
    expect(mockUpdateVenueAsync).not.toHaveBeenCalled();
  });

  it('PATCHes the changed owner-alert fields and refetches the venue on save', async () => {
    await render(<CommunicationsScreen />);

    await toggle(screen.getByLabelText('New booking alert'), true);
    await changeText(screen.getByPlaceholderText('venue@example.com'), 'alerts@biz.com');

    // No error now; Save is enabled.
    expect(screen.queryByText('Enter a valid email address.')).toBeNull();
    await press(() => screen.getByText('Save changes'));

    expect(mockUpdateVenueAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdateVenueAsync).toHaveBeenCalledWith({
      owner_booking_notification_enabled: true,
      owner_booking_notification_email: 'alerts@biz.com',
    });
    expect(mockRefetchVenue).toHaveBeenCalled();
  });

  it('allows enabling with a blank recipient and sends email: null (server falls back to venue email)', async () => {
    await render(<CommunicationsScreen />);

    // Enable but leave the recipient blank — valid (empty is allowed).
    await toggle(screen.getByLabelText('New booking alert'), true);
    expect(screen.queryByText('Enter a valid email address.')).toBeNull();

    await press(() => screen.getByText('Save changes'));

    expect(mockUpdateVenueAsync).toHaveBeenCalledTimes(1);
    // Only the toggle changed (email was already null and stays null) — the
    // payload omits the unchanged email key.
    expect(mockUpdateVenueAsync).toHaveBeenCalledWith({
      owner_booking_notification_enabled: true,
    });
  });

  it('seeds the field from the venue and saves only the edited email (toggle unchanged)', async () => {
    // Start with the alert already on and a saved recipient.
    mockVenue.owner_booking_notification_enabled = true;
    mockVenue.owner_booking_notification_email = 'old@biz.com';
    await render(<CommunicationsScreen />);

    // Field is seeded with the saved value.
    expect(screen.getByDisplayValue('old@biz.com')).toBeTruthy();

    await changeText(screen.getByDisplayValue('old@biz.com'), 'new@biz.com');
    await press(() => screen.getByText('Save changes'));

    expect(mockUpdateVenueAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdateVenueAsync).toHaveBeenCalledWith({
      owner_booking_notification_email: 'new@biz.com',
    });
  });
});
