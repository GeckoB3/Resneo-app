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

const mockPush = jest.fn();

const mockStaff = { data: { staff: { role: 'admin' } } } as {
  data: { staff: { role: string } } | undefined;
};
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => mockStaff }));

const mockDismiss = { mutate: jest.fn() };
const mockSetup = { data: undefined as SetupStatus | undefined };
jest.mock('@/lib/queries/useSetupStatus', () => ({
  useSetupStatus: () => mockSetup,
  useDismissSetupChecklist: () => mockDismiss,
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

    expect(screen.getByText(/What's next · 1\/5/)).toBeTruthy();
    const dismiss = screen.getByLabelText('Dismiss setup checklist');
    await act(async () => {
      fireEvent.press(dismiss);
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
});
