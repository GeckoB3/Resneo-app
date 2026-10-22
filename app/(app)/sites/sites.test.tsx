/**
 * The site picker and All sites (web roles plan §6.2c, §6.3, §6.7; copy from Appendix C "Sites").
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { MeSites, SitesOverview } from '@/types/sites';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockSwitchSite = jest.fn(async (_venueId: string, _then?: string) => undefined);
jest.mock('@/lib/sites/useSwitchSite', () => ({
  useSwitchSite: () => (venueId: string, then?: string) => mockSwitchSite(venueId, then),
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

let mockMe: MeSites;
let mockOverview: { data?: SitesOverview; isLoading?: boolean; isError?: boolean; error?: unknown } = {};
const mockAccept = jest.fn();
const mockDecline = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@/lib/queries/useMeSites', () => ({
  useMeSites: () => ({ data: mockMe, isLoading: false, isError: false, isRefetching: false, refetch: mockRefetch }),
  useAcceptSiteInvite: () => ({ mutateAsync: mockAccept }),
  useDeclineSiteInvite: () => ({ mutateAsync: mockDecline }),
  useSitesOverview: () => ({ isLoading: false, isError: false, isRefetching: false, refetch: mockRefetch, ...mockOverview }),
}));

import { ApiError } from '@/lib/api/client';
import AllSitesScreen from './overview';
import SitesScreen from './index';

const NORTH = '11111111-1111-4111-8111-111111111111';
const SOUTH = '22222222-2222-4222-8222-222222222222';

function meSites(overrides: Partial<MeSites> = {}): MeSites {
  return {
    home_venue_id: NORTH,
    active_venue_id: NORTH,
    sites: [
      { venue_id: NORTH, name: 'Northside', role: 'admin', role_key: 'owner', is_owner: true, onboarding_complete: true },
      { venue_id: SOUTH, name: 'Southside', role: 'staff', role_key: 'front_desk', is_owner: false, onboarding_complete: true },
    ],
    pending_invites: [],
    overview_eligible: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockPush.mockClear();
  mockSwitchSite.mockClear();
  mockAccept.mockReset();
  mockDecline.mockReset();
  mockToast.success.mockClear();
  mockParams = {};
  mockMe = meSites();
  mockOverview = {};
});

describe('the site picker', () => {
  it('lists the sites with their roles and marks the current one', async () => {
    await render(<SitesScreen />);
    expect(screen.getByText('Northside')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.getByText('Front desk')).toBeTruthy();
    expect(screen.getByText('Current site')).toBeTruthy();
  });

  it('switches to a site and opens its Today', async () => {
    await render(<SitesScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Switch to Southside'));
    });
    expect(mockSwitchSite).toHaveBeenCalledWith(SOUTH, undefined);
  });

  it('greets a fresh sign-in with the choice, in the copy deck’s words', async () => {
    mockParams = { welcome: '1' };
    await render(<SitesScreen />);
    expect(
      screen.getByText('You work at more than one business. Choose where to go. You can switch any time from the menu.'),
    ).toBeTruthy();
  });

  it('says adding a site is on the web, as plain text, to an owner', async () => {
    await render(<SitesScreen />);
    expect(screen.getByText('Add a site from your ResNeo dashboard on the web.')).toBeTruthy();
  });

  it('offers All sites only when the overview applies', async () => {
    await render(<SitesScreen />);
    expect(screen.queryByText('All sites')).toBeNull();

    mockMe = meSites({ overview_eligible: true });
    await render(<SitesScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('All sites'));
    });
    expect(mockPush).toHaveBeenCalledWith('/sites/overview');
  });

  describe('invitations', () => {
    const invite = {
      staff_id: '99999999-9999-4999-8999-999999999999',
      venue_id: '33333333-3333-4333-8333-333333333333',
      venue_name: 'Eastside',
      role_key: 'staff' as const,
      is_owner: false,
      invited_at: null,
    };

    it('joins, and says where to switch', async () => {
      mockMe = meSites({ pending_invites: [invite] });
      mockAccept.mockResolvedValueOnce({ site: null });
      await render(<SitesScreen />);
      expect(screen.getByText('Eastside has invited you to join their team.')).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Join Eastside'));
      });
      expect(mockAccept).toHaveBeenCalledWith(invite.staff_id);
      expect(mockToast.success).toHaveBeenCalledWith("You've joined Eastside. Switch sites from the menu.");
    });

    it('asks before declining, then declines', async () => {
      mockMe = meSites({ pending_invites: [invite] });
      mockDecline.mockResolvedValueOnce({ declined: true });
      await render(<SitesScreen />);
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Decline Eastside'));
      });
      expect(mockDecline).not.toHaveBeenCalled();
      expect(screen.getByText("Decline? They'll need to invite you again.")).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByText('Decline'));
      });
      expect(mockDecline).toHaveBeenCalledWith(invite.staff_id);
    });

    it('sends someone whose password a business set to choose their own first', async () => {
      mockMe = meSites({ pending_invites: [invite] });
      const message =
        'Before you join another business, choose your own password. Your current one was set by Northside.';
      mockAccept.mockRejectedValueOnce(new ApiError(message, 409, { error: message, code: 'SET_OWN_PASSWORD_FIRST' }));
      await render(<SitesScreen />);
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Join Eastside'));
      });
      expect(screen.getByText(message)).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByText('Choose a password'));
      });
      expect(mockPush).toHaveBeenCalledWith('/set-password');
    });

    it('shows an owner invitation as a note to contact support, with no Join or Decline', async () => {
      mockMe = meSites({ pending_invites: [{ ...invite, is_owner: true }] });
      await render(<SitesScreen />);
      expect(screen.getByText('This business is waiting for you as its owner. Contact ResNeo support.')).toBeTruthy();
      expect(screen.queryByLabelText('Join Eastside')).toBeNull();
      expect(screen.queryByLabelText('Decline Eastside')).toBeNull();
    });
  });
});

describe('All sites', () => {
  const okSite = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    venue_id: id,
    name,
    timezone: 'Europe/London',
    currency: 'GBP',
    role_key: 'owner' as const,
    is_owner: true,
    can_open_plan: true,
    state: 'ok' as const,
    plan: { tier: 'plus', status: 'active' },
    today: { date: '2026-10-22', bookings: 7, next_booking_time: '14:30' },
    week: {
      start: '2026-10-19',
      end: '2026-10-25',
      booked_pence: 125000,
      new_bookings: 12,
      new_bookings_cancelled: 2,
      no_shows: 1,
      net_takings_pence: null,
    },
    ...extra,
  });

  it('shows each site’s figures, a failed site on its own, and the group total with its notes', async () => {
    mockOverview = {
      data: {
        eligible: true,
        groups: [
          {
            label: 'Your businesses',
            sites: [
              okSite(NORTH, 'Northside'),
              { ...okSite(SOUTH, 'Southside'), state: 'error', today: undefined, week: undefined },
            ],
            totals: {
              sites_counted: 1,
              bookings_today: 7,
              new_bookings: 12,
              new_bookings_cancelled: 2,
              no_shows: 1,
              money: [{ currency: 'GBP', booked_pence: 125000, net_takings_pence: null, takings_sites: 0 }],
            },
          },
        ],
      },
    };
    await render(<AllSitesScreen />);

    expect(screen.getByText('Your businesses')).toBeTruthy();
    expect(screen.getAllByText('Bookings today').length).toBe(2);
    expect(screen.getByText('14:30')).toBeTruthy();
    expect(screen.getAllByText('£1,250').length).toBe(2);
    expect(screen.getAllByText('2 since cancelled').length).toBe(2);
    expect(screen.getByText("We couldn't load this site")).toBeTruthy();
    expect(screen.getByText("Total leaves out Southside, which didn't load.")).toBeTruthy();
    expect(screen.queryByText('Net takings this week')).toBeNull();
  });

  it('switches to a site, or to its Plan page when the person may open it', async () => {
    mockOverview = {
      data: {
        eligible: true,
        groups: [
          {
            label: 'Owned by Alex',
            sites: [okSite(NORTH, 'Northside', { can_open_plan: false }), okSite(SOUTH, 'Southside')],
            totals: null,
          },
        ],
      },
    };
    await render(<AllSitesScreen />);
    expect(screen.queryByLabelText('Plan for Northside')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Switch to Northside'));
    });
    expect(mockSwitchSite).toHaveBeenCalledWith(NORTH, '/today');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Plan for Southside'));
    });
    expect(mockSwitchSite).toHaveBeenCalledWith(SOUTH, '/manage/plan');
  });

  it('shows an ended subscription as its status only', async () => {
    mockOverview = {
      data: {
        eligible: true,
        groups: [
          {
            label: 'Your businesses',
            sites: [{ ...okSite(NORTH, 'Northside'), state: 'ended', today: undefined, week: undefined }],
            totals: null,
          },
        ],
      },
    };
    await render(<AllSitesScreen />);
    expect(screen.getByText('Subscription ended')).toBeTruthy();
    expect(screen.queryByText('Active')).toBeNull();
  });

  it('offers to try again when the overview cannot load', async () => {
    mockOverview = { isError: true, error: new Error('offline') };
    await render(<AllSitesScreen />);
    expect(screen.getByText("We couldn't load your sites. Please try again.")).toBeTruthy();
  });
});
