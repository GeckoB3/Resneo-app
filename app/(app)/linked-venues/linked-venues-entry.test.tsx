/**
 * The ways into Link with a venue from the Linked venues screen. At the limit of waiting requests the
 * server refuses another, and the owner used to find that out at Send, after every step (CQ-17.3,
 * R1-06). The button is greyed out now, with the reason under it. The wizard's own way out to a request
 * that is already waiting opens the review (CQ-17.6), and to a partial link opens that link (CQ-17.2).
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { AccountLinkView, AccountLinksListResponse } from '@/types/linked-venues';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

// The sheets have their own tests: here only what the screen hands them.
const mockWizard: { current: Record<string, unknown> | null } = { current: null };
jest.mock('@/components/linked/setup/LinkSetupSheet', () => ({
  LinkSetupSheet: (props: Record<string, unknown>) => {
    mockWizard.current = props;
    return null;
  },
}));
const mockReview: { current: Record<string, unknown> | null } = { current: null };
jest.mock('@/components/linked/setup/ReviewLinkRequestSheet', () => ({
  ReviewLinkRequestSheet: (props: Record<string, unknown>) => {
    mockReview.current = props;
    return null;
  },
}));
const mockAccept: { current: Record<string, unknown> | null } = { current: null };
jest.mock('@/components/linked/AcceptInviteSheet', () => ({
  AcceptInviteSheet: (props: Record<string, unknown>) => {
    mockAccept.current = props;
    return null;
  },
}));
jest.mock('@/components/linked/InviteLinkSheet', () => ({ InviteLinkSheet: () => null }));
jest.mock('@/components/linked/LinkedNotificationPrefsCard', () => ({ LinkedNotificationPrefsCard: () => null }));

const mockToastError = jest.fn();
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: mockToastError }) }));
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => ({ isLoading: false, data: { staff: { role: 'admin' } } }) }));

let mockList: AccountLinksListResponse;
const mockRefetch = jest.fn();
jest.mock('@/lib/queries/useLinkedVenues', () => ({
  useLinkedVenues: () => ({ data: mockList, isLoading: false, isError: false, isRefetching: false, refetch: mockRefetch }),
  useMyCalendars: () => ({ data: { calendars: [] } }),
  useRespondLink: () => ({ mutate: jest.fn(), isPending: false }),
}));

import LinkedVenuesScreen from './index';

const GRANT = { calendar: 'full_details', pii: false, act: 'none', calendarIds: null };
const link = (id: string, more: Partial<AccountLinkView> = {}): AccountLinkView =>
  ({
    id,
    status: 'pending',
    initiatedByMe: true,
    otherVenue: { id: `v-${id}`, name: `Venue ${id}`, slug: `venue-${id}` },
    iCan: GRANT,
    theyCan: GRANT,
    ...more,
  }) as unknown as AccountLinkView;

const list = (links: AccountLinkView[], outgoingPendingCount: number): AccountLinksListResponse =>
  ({
    eligibility: { feature: true, canCreate: true, reason: null },
    venue: { id: 'v-me', name: 'Aura', slug: 'aura' },
    links,
    outgoingPendingCount,
    maxOutgoingPending: 10,
  }) as unknown as AccountLinksListResponse;

const LIMIT = 'You have 10 link requests waiting, the most you can have at once. Cancel one under Sent by you to send another.';
const linkButton = () => screen.getByRole('button', { name: 'Link a venue' });
const wizard = () => mockWizard.current as { visible: boolean; prefill: unknown; onReviewRequest: (id: string) => void; onEditPermissions: (id: string) => void };

beforeEach(() => {
  mockPush.mockClear();
  mockRefetch.mockReset();
  mockToastError.mockClear();
  mockParams = {};
  mockWizard.current = null;
  mockReview.current = null;
  mockAccept.current = null;
});

describe('Link a venue at the request limit (CQ-17.3)', () => {
  const ten = Array.from({ length: 10 }, (_, i) => link(`s${i}`));

  it('is greyed out at the limit, with the reason under it', async () => {
    mockList = list(ten, 10);
    await render(<LinkedVenuesScreen />);
    expect(linkButton().props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText(LIMIT)).toBeTruthy();
    // An invite link for someone else to use sends nothing from this venue.
    expect(screen.getByRole('button', { name: 'Get invite link' }).props.accessibilityState?.disabled).toBeFalsy();
    // The other way into the wizard goes too.
    expect(screen.queryByRole('button', { name: 'Have an invite link?' })).toBeNull();
  });

  it('is open below the limit, with no line', async () => {
    mockList = list(ten.slice(0, 9), 9);
    await render(<LinkedVenuesScreen />);
    expect(linkButton().props.accessibilityState?.disabled).toBeFalsy();
    expect(screen.queryByText(LIMIT)).toBeNull();
    expect(screen.getByRole('button', { name: 'Have an invite link?' })).toBeTruthy();
    await act(async () => {
      fireEvent.press(linkButton());
    });
    expect(wizard().visible).toBe(true);
  });

  it('holds on the first-run screen too', async () => {
    mockList = { ...list([], 10) };
    await render(<LinkedVenuesScreen />);
    expect(linkButton().props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText(LIMIT)).toBeTruthy();
  });

  it('says so rather than opening the wizard from a verified invite link', async () => {
    mockList = list(ten, 10);
    mockParams = { invite: 'tok' };
    await render(<LinkedVenuesScreen />);
    await act(async () => {
      (mockAccept.current as { onVerified: (v: { slug: string; name: string }) => void }).onVerified({ slug: 'x', name: 'X' });
    });
    expect(wizard().visible).toBe(false);
    expect(mockToastError).toHaveBeenCalledWith(LIMIT);
  });
});

describe("the wizard's ways out", () => {
  const openWizard = async () => {
    await render(<LinkedVenuesScreen />);
    await act(async () => {
      fireEvent.press(linkButton());
    });
    expect(wizard().visible).toBe(true);
  };
  /** The screen waits for the wizard to slide away before it opens the review. */
  const afterSwap = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });

  it('Review their request closes the wizard and opens that request, as ?review= does', async () => {
    const theirs = link('t1', { initiatedByMe: false });
    mockList = list([theirs], 0);
    await openWizard();
    await act(async () => {
      wizard().onReviewRequest('t1');
    });
    expect(wizard().visible).toBe(false);
    await afterSwap();
    expect(mockReview.current?.link).toBe(theirs);
    expect(mockReview.current?.visible).toBe(true);
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('reads the list again for a request that arrived after it was read', async () => {
    const theirs = link('t2', { initiatedByMe: false });
    mockList = list([link('s1')], 1);
    mockRefetch.mockResolvedValue({ data: list([link('s1'), theirs], 1) });
    await openWizard();
    await act(async () => {
      wizard().onReviewRequest('t2');
    });
    await afterSwap();
    expect(mockRefetch).toHaveBeenCalled();
    expect(mockReview.current?.link).toBe(theirs);
  });

  it('says so when the request has gone', async () => {
    mockList = list([link('s1')], 1);
    mockRefetch.mockResolvedValue({ data: list([link('s1')], 1) });
    await openWizard();
    await act(async () => {
      wizard().onReviewRequest('gone');
    });
    await afterSwap();
    expect(mockToastError).toHaveBeenCalledWith('That request is no longer waiting.');
    expect(mockReview.current?.visible).toBe(false);
  });

  it('Edit permissions closes the wizard and opens that link', async () => {
    mockList = list([link('a1', { status: 'accepted' })], 0);
    await openWizard();
    await act(async () => {
      wizard().onEditPermissions('a1');
    });
    expect(wizard().visible).toBe(false);
    expect(mockPush).toHaveBeenCalledWith('/linked-venues/a1');
  });
});
