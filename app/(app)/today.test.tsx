/**
 * SetupChecklistCard (Domain 17) — render coverage for the onboarding-aware
 * checklist. The step derivation itself is unit-tested in
 * `components/today/setup-checklist-steps.test.ts`; here we verify the card's
 * progress bar, onboarding-vs-complete heading + dismiss affordance, and the
 * admin/complete hide rules.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { SetupStatus } from '@/lib/queries/useSetupStatus';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Render the dismiss-confirmation Sheet's children inline when visible (avoids
// gesture-handler/Modal), matching the pattern in ResourceManagerSheet.test.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockPush = jest.fn();

const mockStaff = { data: { staff: { role: 'admin' } } } as {
  data: { staff: { role: string } } | undefined;
};
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => mockStaff }));

const mockDismiss = { mutate: jest.fn(), isPending: false };
const mockSnooze = { mutate: jest.fn(), isPending: false };
const mockSetup = { data: undefined as SetupStatus | undefined };
jest.mock('@/lib/queries/useSetupStatus', () => ({
  useSetupStatus: () => mockSetup,
  useDismissSetupChecklist: () => mockDismiss,
  useSnoozeSetupStep: () => mockSnooze,
}));

// The card reads the venue id to scope the tap-through prompt storage.
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: { id: 'venue-1' } }),
}));

// Tap-through prompt completion is device-local (expo-secure-store); keep the
// render tests deterministic by starting from an empty set.
const mockMarkStepClicked = jest.fn();
jest.mock('@/lib/queries/useClickedSetupSteps', () => ({
  useClickedSetupSteps: () => new Set<string>(),
  markSetupStepClicked: (...args: unknown[]) => mockMarkStepClicked(...args),
}));

import { SetupChecklistCard } from '@/app/(app)/today';

function status(partial: Partial<SetupStatus> = {}): SetupStatus {
  return {
    setup_checklist_dismissed: false,
    onboarding_completed: false,
    profile_complete: false,
    availability_set: false,
    guest_booking_ready: false,
    stripe_connected: false,
    first_booking_made: false,
    is_admin: true,
    booking_model: 'unified_scheduling',
    enabled_models: [],
    secondary_event_catalog_ready: true,
    secondary_class_catalog_ready: true,
    secondary_resource_catalog_ready: true,
    ...partial,
  };
}

beforeEach(() => {
  mockPush.mockClear();
  mockDismiss.mutate.mockClear();
  mockSnooze.mutate.mockClear();
  mockStaff.data = { staff: { role: 'admin' } };
  mockSetup.data = undefined;
});

describe('SetupChecklistCard — onboarding incomplete (pinned first-run)', () => {
  it('renders the "Get your venue ready" heading, progress %, and incomplete steps', async () => {
    // USE venue, profile done → 1/5 = 20%.
    mockSetup.data = status({ profile_complete: true });
    await render(<SetupChecklistCard />);

    expect(screen.getByText('Get your venue ready · 1/5')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
    // Completed step is hidden; incomplete ones surface their label.
    expect(screen.queryByText('Business profile')).toBeNull();
    expect(screen.getByText('Team & services')).toBeTruthy();
    expect(screen.getByText('Public booking page')).toBeTruthy();
  });

  it('does NOT offer a dismiss control before onboarding is complete', async () => {
    mockSetup.data = status();
    await render(<SetupChecklistCard />);
    expect(screen.queryByLabelText('Dismiss setup checklist')).toBeNull();
  });

  it('navigates to the step route when a row is pressed', async () => {
    mockSetup.data = status({ profile_complete: true });
    await render(<SetupChecklistCard />);
    await act(async () => {
      fireEvent.press(screen.getByText('Team & services'));
    });
    expect(mockPush).toHaveBeenCalledWith('/manage/services');
  });
});

describe('SetupChecklistCard — onboarding complete (dismissible)', () => {
  it('shows the "What\'s next" heading and a dismiss control', async () => {
    mockSetup.data = status({ onboarding_completed: true, profile_complete: true });
    await render(<SetupChecklistCard />);

    // 5 required steps + the 3 post-onboarding prompts, which count toward the
    // total once onboarding is complete (web #105).
    expect(screen.getByText(/What's next · 1\/8/)).toBeTruthy();
    expect(screen.getByText('Customise your booking page')).toBeTruthy();
    expect(screen.getByText('Import your bookings and customers')).toBeTruthy();
  });

  it('confirms before dismissing rather than hiding on the first tap', async () => {
    mockSetup.data = status({ onboarding_completed: true, profile_complete: true });
    await render(<SetupChecklistCard />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Dismiss setup checklist'));
    });
    // The X opens a confirmation; nothing is dismissed yet (web #105).
    expect(mockDismiss.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Dismiss the setup steps?')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Dismiss setup steps'));
    });
    expect(mockDismiss.mutate).toHaveBeenCalledTimes(1);
  });

  it('hides once the checklist is dismissed (post-onboarding)', async () => {
    mockSetup.data = status({ onboarding_completed: true, setup_checklist_dismissed: true });
    await render(<SetupChecklistCard />);
    expect(screen.toJSON()).toBeNull();
  });
});

describe('SetupChecklistCard — hide rules', () => {
  it('renders nothing for non-admins', async () => {
    mockStaff.data = { staff: { role: 'staff' } };
    mockSetup.data = status();
    await render(<SetupChecklistCard />);
    expect(screen.toJSON()).toBeNull();
  });

  it('renders nothing when every step is complete', async () => {
    mockSetup.data = status({
      profile_complete: true,
      availability_set: true,
      guest_booking_ready: true,
      stripe_connected: true,
      first_booking_made: true,
    });
    await render(<SetupChecklistCard />);
    expect(screen.toJSON()).toBeNull();
  });

  it('renders nothing once the only steps left are snoozed', async () => {
    mockSetup.data = status({
      profile_complete: true,
      availability_set: true,
      guest_booking_ready: true,
      setup_checklist_snoozed_keys: ['stripe_connected', 'first_booking_made'],
    });
    await render(<SetupChecklistCard />);
    expect(screen.toJSON()).toBeNull();
  });
});

describe('SetupChecklistCard — "Not now" on optional steps', () => {
  /** Everything except the two optional steps is done, so both rows show. */
  const nearlyDone: Partial<SetupStatus> = {
    profile_complete: true,
    availability_set: true,
    guest_booking_ready: true,
  };

  it('offers "Not now" on the optional steps only', async () => {
    mockSetup.data = status(nearlyDone);
    await render(<SetupChecklistCard />);
    // Stripe + first booking are the two rows left, and both are optional.
    expect(screen.getByText('Stripe payments')).toBeTruthy();
    expect(screen.getByText('First test booking')).toBeTruthy();
    expect(screen.getAllByText('Not now')).toHaveLength(2);
  });

  it('does not offer "Not now" on a required step', async () => {
    mockSetup.data = status({ ...nearlyDone, guest_booking_ready: false });
    await render(<SetupChecklistCard />);
    expect(screen.getByText('Public booking page')).toBeTruthy();
    // Still only the two optional rows carry the action.
    expect(screen.getAllByText('Not now')).toHaveLength(2);
  });

  it('snoozes the step it belongs to, without navigating', async () => {
    mockSetup.data = status(nearlyDone);
    await render(<SetupChecklistCard />);
    await act(async () => {
      fireEvent.press(screen.getAllByText('Not now')[0]!);
    });
    expect(mockSnooze.mutate).toHaveBeenCalledWith('stripe_connected');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('hides the row immediately, without waiting for the server', async () => {
    // The mutation is mocked and never resolves a refetch, so anything still on
    // screen after the press would be waiting on the network.
    mockSetup.data = status(nearlyDone);
    await render(<SetupChecklistCard />);
    await act(async () => {
      fireEvent.press(screen.getAllByText('Not now')[0]!);
    });
    expect(screen.queryByText('Stripe payments')).toBeNull();
    expect(screen.getByText('First test booking')).toBeTruthy();
  });

  it('hides a step the server reports as snoozed', async () => {
    mockSetup.data = status({
      ...nearlyDone,
      setup_checklist_snoozed_keys: ['stripe_connected'],
    });
    await render(<SetupChecklistCard />);
    expect(screen.queryByText('Stripe payments')).toBeNull();
    expect(screen.getByText('First test booking')).toBeTruthy();
    expect(screen.getAllByText('Not now')).toHaveLength(1);
  });
});
