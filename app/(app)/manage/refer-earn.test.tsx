/**
 * Refer & Earn screen (Domain 10) — render + state coverage.
 *
 * Verifies the three states the screen owns:
 *   • data → code, KPI cards (formatted pence + counts) and referral rows render;
 *   • empty → "No referrals yet" with the KPI shell still shown;
 *   • disabled/403 → the programme-disabled EmptyState (route replies 403).
 *
 * The pure date formatter is unit-tested separately below. jest hoists mock
 * factories above imports, so every closed-over var is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import type { ReferralsDashboardData } from '@/lib/queries/useReferrals';
import { formatReferralDate } from '@/app/(app)/manage/refer-earn';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
}));

const mockSetStringAsync = jest.fn((..._a: unknown[]) => Promise.resolve(true));
jest.mock('expo-clipboard', () => ({
  setStringAsync: (...args: unknown[]) => mockSetStringAsync(...args),
}));

const mockShareAsync = jest.fn((..._a: unknown[]) => Promise.resolve());
const mockIsAvailableAsync = jest.fn(() => Promise.resolve(true));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailableAsync(),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

// Admin staff by default — the screen gates the query on the admin role.
const mockStaff = { data: { staff: { role: 'admin' } }, isLoading: false } as {
  data: { staff: { role: string } } | undefined;
  isLoading: boolean;
};
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => mockStaff }));

// Mutable referrals query result — each test sets data/error/flags.
const mockReferrals = {
  data: undefined as ReferralsDashboardData | undefined,
  isLoading: false,
  isError: false,
  isRefetching: false,
  error: null as unknown,
  refetch: jest.fn(),
};
jest.mock('@/lib/queries/useReferrals', () => {
  const actual = jest.requireActual('@/lib/queries/useReferrals');
  return { ...actual, useReferrals: () => mockReferrals };
});

import ReferEarnScreen from '@/app/(app)/manage/refer-earn';

const DATA: ReferralsDashboardData = {
  code: 'RESNEO-ABCD',
  shareableLink: 'https://app.resneo.com/r/RESNEO-ABCD',
  rewardDisplay: 'Give £20, get £20',
  referrerVenueName: 'Glow Studio',
  totalCreditedPence: 4000,
  creditRemainingPence: 1500,
  counts: { total: 3, credited: 2, pending: 1 },
  referralsForUi: [
    {
      id: 'r1',
      refereeName: 'Acme Clinic',
      status: 'credited',
      statusLabel: 'Credited',
      rewardDisplay: '£20',
      occurredAt: '2026-06-01T10:00:00.000Z',
      voidReason: null,
    },
    {
      id: 'r2',
      refereeName: 'Bright Spa',
      status: 'void',
      statusLabel: 'Void',
      rewardDisplay: null,
      occurredAt: '2026-05-20T10:00:00.000Z',
      voidReason: 'Referee already had an account',
    },
  ],
};

function setReferrals(next: Partial<typeof mockReferrals>) {
  Object.assign(mockReferrals, {
    data: undefined,
    isLoading: false,
    isError: false,
    isRefetching: false,
    error: null,
    ...next,
  });
}

beforeEach(() => {
  mockSetStringAsync.mockClear();
  mockShareAsync.mockClear();
  mockIsAvailableAsync.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockToast.info.mockClear();
  mockStaff.data = { staff: { role: 'admin' } };
  mockStaff.isLoading = false;
  setReferrals({ data: DATA });
});

describe('Refer & Earn — data state', () => {
  it('renders the code, KPI cards and referral rows', async () => {
    await render(<ReferEarnScreen />);

    // Code + reward + link.
    expect(screen.getByText('RESNEO-ABCD')).toBeTruthy();
    expect(screen.getByText('Give £20, get £20')).toBeTruthy();
    expect(screen.getByText('https://app.resneo.com/r/RESNEO-ABCD')).toBeTruthy();

    // KPI cards — formatted pence + counts.
    expect(screen.getByText('£40.00')).toBeTruthy(); // total credited
    expect(screen.getByText('£15.00')).toBeTruthy(); // credit remaining
    expect(screen.getByText('2 credited')).toBeTruthy();
    expect(screen.getByText('1 pending')).toBeTruthy();

    // Referral rows + status pills + void reason.
    expect(screen.getByText('Acme Clinic')).toBeTruthy();
    expect(screen.getByText('Credited')).toBeTruthy();
    expect(screen.getByText('Bright Spa')).toBeTruthy();
    expect(screen.getByText('Referee already had an account')).toBeTruthy();
  });

  it('copies the shareable link via expo-clipboard', async () => {
    await render(<ReferEarnScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Copy link'));
    });
    expect(mockSetStringAsync).toHaveBeenCalledWith('https://app.resneo.com/r/RESNEO-ABCD');
    expect(mockToast.success).toHaveBeenCalledWith('Referral link copied.');
  });

  it('shares the link via the OS share sheet when available', async () => {
    await render(<ReferEarnScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Share'));
    });
    expect(mockShareAsync).toHaveBeenCalledWith(
      'https://app.resneo.com/r/RESNEO-ABCD',
      expect.objectContaining({ dialogTitle: expect.any(String) }),
    );
  });
});

describe('Refer & Earn — empty + credit-remaining-null', () => {
  it('shows "No referrals yet" and an em-dash for null credit remaining', async () => {
    setReferrals({
      data: { ...DATA, referralsForUi: [], creditRemainingPence: null, counts: { total: 0, credited: 0, pending: 0 } },
    });
    await render(<ReferEarnScreen />);

    expect(screen.getByText('No referrals yet')).toBeTruthy();
    // KPI shell still rendered; null credit remaining → "—".
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText('Acme Clinic')).toBeNull();
  });
});

describe('Refer & Earn — disabled / 403', () => {
  it('shows the programme-disabled state on a 403', async () => {
    setReferrals({ isError: true, error: new ApiError('Forbidden', 403) });
    await render(<ReferEarnScreen />);

    expect(screen.getByText('Refer & Earn isn’t available')).toBeTruthy();
    expect(screen.queryByText('Your referrals')).toBeNull();
  });

  it('shows the admin-only gate for non-admin staff', async () => {
    mockStaff.data = { staff: { role: 'staff' } };
    await render(<ReferEarnScreen />);

    expect(screen.getByText('Refer & Earn is only available to venue admins.')).toBeTruthy();
  });
});

describe('formatReferralDate', () => {
  it('formats an ISO date as D MMM YYYY', () => {
    expect(formatReferralDate('2026-06-01T10:00:00.000Z')).toBe('1 Jun 2026');
  });

  it('returns an em-dash for null / unparseable input', () => {
    expect(formatReferralDate(null)).toBe('—');
    expect(formatReferralDate('not-a-date')).toBe('—');
  });
});
