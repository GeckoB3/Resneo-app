/**
 * WaitlistAvailabilityBanner — cross-dashboard open-slot nudge (Waitlist 09 High).
 *
 * Mirrors the web `WaitlistAvailabilityBanner`. Exercises:
 *  - gating: renders nothing unless the venue is in staff_choose mode with alerts,
 *  - the primary-alert message + "+N more" summary (reading the real backend
 *    `slot_time_hm` / `calendar_name` fields),
 *  - Offer → POST { action: 'offer' } + a notified toast,
 *  - Dismiss → two-step arm-then-confirm → POST { action: 'dismiss' },
 *  - View → router.push('/waitlist').
 *
 * jest hoists mock factories above imports, so every closed-over variable is
 * prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import type { WaitlistAlert } from '@/types/waitlist';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

// VenueProvider — flags drive the staff_choose gate; mutated per-test.
let mockFeatureFlags: {
  resolved: Record<string, boolean>;
  raw: { waitlist_config?: { mode?: string } };
} | null;
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ featureFlags: mockFeatureFlags }),
}));

// useWaitlist hooks — alerts query + act mutation.
let mockAlerts: WaitlistAlert[];
const mockActMutate = jest.fn();
jest.mock('@/lib/queries/useWaitlist', () => ({
  useWaitlistAlerts: (enabled: boolean) => ({
    data: enabled ? { alerts: mockAlerts } : undefined,
  }),
  useActOnWaitlistAlert: () => ({ mutate: mockActMutate }),
}));

import { WaitlistAvailabilityBanner, buildAlertMessage } from '@/components/waitlist/WaitlistAvailabilityBanner';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

const STAFF_CHOOSE = {
  resolved: { waitlist_v2: true },
  raw: { waitlist_config: { mode: 'staff_choose' } },
};

const ALERT: WaitlistAlert = {
  id: 'a1',
  slot_date: '2026-06-20',
  slot_time_hm: '14:30',
  service_name: 'Haircut',
  calendar_name: 'Alex',
  matching_waitlist_count: 2,
};

beforeEach(() => {
  mockPush.mockClear();
  mockActMutate.mockReset();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockToast.info.mockClear();
  mockFeatureFlags = STAFF_CHOOSE;
  mockAlerts = [ALERT];
});

describe('buildAlertMessage', () => {
  it('reads slot_time_hm + calendar_name and pluralises the guest count', () => {
    expect(buildAlertMessage(ALERT)).toContain('Haircut');
    expect(buildAlertMessage(ALERT)).toContain('on Alex');
    expect(buildAlertMessage(ALERT)).toContain('14:30');
    expect(buildAlertMessage(ALERT)).toContain('2 guests on the waitlist match.');
    expect(buildAlertMessage({ ...ALERT, matching_waitlist_count: 1 })).toContain(
      '1 guest on the waitlist matches.',
    );
  });

  it('falls back to the legacy slot_time / practitioner_name aliases', () => {
    const legacy: WaitlistAlert = {
      id: 'a2',
      slot_date: '2026-06-21',
      slot_time: '10:00:00',
      practitioner_name: 'Sam',
      service_name: null,
      matching_waitlist_count: 1,
    };
    const msg = buildAlertMessage(legacy);
    expect(msg).toContain('an appointment');
    expect(msg).toContain('on Sam');
    expect(msg).toContain('10:00');
  });
});

describe('WaitlistAvailabilityBanner gating', () => {
  it('renders nothing when not in staff_choose mode', async () => {
    mockFeatureFlags = { resolved: { waitlist_v2: true }, raw: { waitlist_config: { mode: 'notify_in_order' } } };
    await render(<WaitlistAvailabilityBanner />);
    expect(screen.queryByText('Waitlist')).toBeNull();
  });

  it('renders nothing when there are no alerts', async () => {
    mockAlerts = [];
    await render(<WaitlistAvailabilityBanner />);
    expect(screen.queryByText('Waitlist')).toBeNull();
  });

  it('renders nothing when the waitlist feature is off', async () => {
    mockFeatureFlags = { resolved: { waitlist_v2: false }, raw: { waitlist_config: { mode: 'staff_choose' } } };
    await render(<WaitlistAvailabilityBanner />);
    expect(screen.queryByText('Waitlist')).toBeNull();
  });
});

describe('WaitlistAvailabilityBanner actions', () => {
  it('shows the primary alert and the +N more summary', async () => {
    mockAlerts = [ALERT, { ...ALERT, id: 'a2' }];
    await render(<WaitlistAvailabilityBanner />);
    expect(screen.getByText('Waitlist')).toBeTruthy();
    expect(screen.getByText(/Availability opened for Haircut/)).toBeTruthy();
    expect(screen.getByText('+1 more open slot on the waitlist')).toBeTruthy();
  });

  it('offers the appointment and toasts that the guest was notified', async () => {
    mockActMutate.mockImplementation((_input, opts) =>
      opts.onSuccess({ guest_name: 'Pat', email_sent: true }),
    );
    await render(<WaitlistAvailabilityBanner />);

    await press(() => screen.getByText('Offer appointment'));

    expect(mockActMutate.mock.calls[0][0]).toEqual({ id: 'a1', action: 'offer' });
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('Pat'));
  });

  it('arms then confirms Dismiss before POSTing', async () => {
    mockActMutate.mockImplementation((_input, opts) => opts.onSuccess({}));
    await render(<WaitlistAvailabilityBanner />);

    // First tap arms (no mutation yet); the label flips.
    await press(() => screen.getByText('Dismiss'));
    expect(mockActMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Tap to confirm')).toBeTruthy();

    // Second tap confirms.
    await press(() => screen.getByText('Tap to confirm'));
    expect(mockActMutate.mock.calls[0][0]).toEqual({ id: 'a1', action: 'dismiss' });
    expect(mockToast.info).toHaveBeenCalledWith('Alert dismissed.');
  });

  it('navigates to the waitlist screen on View', async () => {
    await render(<WaitlistAvailabilityBanner />);
    await press(() => screen.getByText('View'));
    expect(mockPush).toHaveBeenCalledWith('/waitlist');
  });

  it('surfaces an API error as an error toast', async () => {
    mockActMutate.mockImplementation((_input, opts) =>
      opts.onError(new ApiError('Slot already filled', 409)),
    );
    await render(<WaitlistAvailabilityBanner />);

    await press(() => screen.getByText('Offer appointment'));
    expect(mockToast.error).toHaveBeenCalledWith('Slot already filled');
  });
});
