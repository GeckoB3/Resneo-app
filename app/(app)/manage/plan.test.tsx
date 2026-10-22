/**
 * Plan & payments with the four roles (web roles plan §5.3): the plan, billing, invoices, payouts
 * and closing the business need the owner, or an admin with "Billing, payouts and admins". Any
 * other admin sees the plan read only, as the web does: no billing-status read and no plan
 * previews (the routes would only 403), no billing actions, payouts read only, and closing the
 * business shows its state without the controls. A server before roles says nothing, so every
 * admin keeps it all.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve()),
  openAuthSessionAsync: jest.fn(),
}));
// The app's own link, as a build makes it (jest has no app manifest for expo-linking to read).
jest.mock('expo-linking', () => ({
  ...jest.requireActual<typeof import('expo-linking')>('expo-linking'),
  createURL: (path: string) => `resneo://${path}`,
}));
jest.mock('@/lib/billing/store-billing-policy', () => ({ mustManageSubscriptionOnWeb: () => false }));

let mockVenue: Record<string, unknown> = {};
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue, isLoading: false, refetch: jest.fn() }),
}));

const mockUseBillingStatus = jest.fn();
const mockPortal = jest.fn();
const mockConnectMutate = jest.fn();
const mockRefetchStripe = jest.fn();
jest.mock('@/lib/queries/useBillingStatus', () => {
  const actual = jest.requireActual<typeof import('@/lib/queries/useBillingStatus')>('@/lib/queries/useBillingStatus');
  const mutation = () => ({ mutate: jest.fn(), isPending: false });
  return {
    isSuperuserFreeBillingAccess: actual.isSuperuserFreeBillingAccess,
    useBillingStatus: (enabled: boolean) => {
      mockUseBillingStatus(enabled);
      return {
        data: enabled ? { plan_status: 'active', pricing_tier: 'plus', stripe_subscription_id: 'sub_1' } : undefined,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    },
    useStripeConnect: () => ({
      data: { charges_enabled: false, details_submitted: false },
      isLoading: false,
      error: null,
      refetch: mockRefetchStripe,
    }),
    useBillingPortalSession: () => ({ mutate: mockPortal, isPending: false }),
    useChangePlan: mutation,
    useStripeConnectLink: () => ({ mutate: mockConnectMutate, isPending: false }),
    useStripeDashboardLink: mutation,
  };
});
jest.mock('@/lib/queries/useSmsUsage', () => ({ useSmsUsage: () => ({ data: undefined, refetch: jest.fn() }) }));
// The plan change section (and its previews) has its own tests; here only whether it renders.
jest.mock('@/components/plan/PlanChangeSection', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return { PlanChangeSection: () => React.createElement(Text, null, 'Change plan section') };
});
const mockDeleteSheet = jest.fn();
jest.mock('@/components/manage/DeleteVenueSheet', () => ({
  DeleteVenueSheet: (props: { visible: boolean; canAct?: boolean }) => {
    mockDeleteSheet(props);
    return null;
  },
}));

import PlanScreen from '@/app/(app)/manage/plan';

const BASE = {
  id: 'v1',
  name: 'Glow Bar',
  currency: 'gbp',
  pricing_tier: 'plus',
  plan_status: 'active',
  booking_model: 'unified_scheduling',
  active_booking_models: [],
  enabled_models: [],
  stripe_connected_account_id: 'acct_1',
  stripe_subscription_id: 'sub_1',
};

beforeEach(() => {
  mockUseBillingStatus.mockClear();
  mockDeleteSheet.mockClear();
  mockPortal.mockClear();
});

describe('an admin without "Billing, payouts and admins"', () => {
  beforeEach(() => {
    mockVenue = {
      ...BASE,
      current_user_role: 'admin',
      current_user_role_key: 'admin',
      current_user_is_owner: false,
      current_user_permissions: { billing_payouts_admins: false },
      current_user_billing_payouts_admins: false,
    };
  });

  it('never asks for the billing status, and shows the plan read only', async () => {
    await render(<PlanScreen />);
    expect(mockUseBillingStatus).toHaveBeenCalled();
    expect(mockUseBillingStatus.mock.calls.every(([enabled]) => enabled === false)).toBe(true);
    expect(
      screen.getByText('Only the owner, or an admin they allow, can change the plan, manage billing or close the business.'),
    ).toBeTruthy();
    expect(screen.queryByText('Manage billing')).toBeNull();
    expect(screen.queryByText('Change plan section')).toBeNull();
  });

  it('shows payouts read only, with who can finish them', async () => {
    await render(<PlanScreen />);
    expect(screen.queryByText('Continue setup')).toBeNull();
    expect(screen.getByText('Only the owner, or an admin they allow, can do this.')).toBeTruthy();
  });

  it('lets them see the closure state, but not schedule or cancel one', async () => {
    await render(<PlanScreen />);
    expect(screen.getByText('Only the owner, or an admin they allow, can close the business or cancel a closure.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('See closure status'));
    });
    expect(mockDeleteSheet).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true, canAct: false }));
  });
});

describe('the owner, and an admin from before roles', () => {
  it('gives the owner every billing action', async () => {
    mockVenue = {
      ...BASE,
      current_user_role: 'admin',
      current_user_role_key: 'owner',
      current_user_is_owner: true,
      current_user_permissions: {},
      current_user_billing_payouts_admins: true,
    };
    await render(<PlanScreen />);
    expect(mockUseBillingStatus).toHaveBeenLastCalledWith(true);
    expect(screen.getByText('Manage billing')).toBeTruthy();
    expect(screen.getByText('Change plan section')).toBeTruthy();
    expect(screen.getByText('Continue setup')).toBeTruthy();
    expect(screen.getByText('Delete this venue…')).toBeTruthy();
  });

  it('keeps every power for an admin when the server sends no role fields', async () => {
    mockVenue = { ...BASE, current_user_role: 'admin' };
    await render(<PlanScreen />);
    expect(mockUseBillingStatus).toHaveBeenLastCalledWith(true);
    expect(screen.getByText('Manage billing')).toBeTruthy();
  });
});

describe('opening the plan on the web', () => {
  it('names this venue, so a login with several businesses lands on this one (§6.2b)', async () => {
    const venueId = '6f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0';
    mockVenue = { ...BASE, id: venueId, current_user_role: 'admin', current_user_role_key: 'owner', current_user_is_owner: true };
    const openBrowser = jest.mocked(jest.requireMock<typeof import('expo-web-browser')>('expo-web-browser').openBrowserAsync);
    openBrowser.mockClear();
    await render(<PlanScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('View plan on web'));
    });
    expect(openBrowser).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/dashboard/settings\\?tab=plan&site=${venueId}$`)));
  });
});

describe('connecting Stripe from the app (owner, 2026-10-22)', () => {
  it('opens Stripe in a window that closes when Stripe hands back, then reads Stripe again', async () => {
    mockVenue = { ...BASE, current_user_role: 'admin', current_user_role_key: 'owner', current_user_is_owner: true };
    const openAuthSession = jest.mocked(
      jest.requireMock<typeof import('expo-web-browser')>('expo-web-browser').openAuthSessionAsync,
    );
    openAuthSession.mockResolvedValue({ type: 'success', url: 'resneo://stripe-return?status=expired' });
    mockConnectMutate.mockImplementation((_: unknown, opts: { onSuccess: (r: { url: string }) => void }) =>
      opts.onSuccess({ url: 'https://connect.stripe.com/setup/e/acct_1/abc' }),
    );
    mockRefetchStripe.mockClear();
    await render(<PlanScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Continue setup'));
    });
    expect(openAuthSession).toHaveBeenCalledWith(
      'https://connect.stripe.com/setup/e/acct_1/abc',
      expect.stringContaining('stripe-return'),
      expect.objectContaining({ preferEphemeralSession: true }),
    );
    expect(mockRefetchStripe).toHaveBeenCalled();
    expect(screen.getByText('That link to Stripe expired. Tap the button again to get a new one.')).toBeTruthy();
  });
});
