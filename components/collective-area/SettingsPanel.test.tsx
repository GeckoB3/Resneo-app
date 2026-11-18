/**
 * Manage collective, Settings (card-on-file plan §21, D27): the host edits the booking rules with
 * the version it read, a stale save says so and shows the current value, members read plain values
 * under "Set by {host}. Ask {host} to change it.", the other parts are summaries with links, and a
 * server without the section says it is not available.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import type { CollectiveSettingsPayload } from '@/lib/queries/useCollectiveSettings';

import { SettingsPanel, appRouteForSettingsHref, memberRuleLines } from './SettingsPanel';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/haptics', () => ({ hapticSuccess: jest.fn(), hapticTap: jest.fn(), hapticWarning: jest.fn() }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
const mockOpenBrowser = jest.fn(() => Promise.resolve({}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (...a: unknown[]) => mockOpenBrowser(...(a as [])) }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), getWebUrl: () => 'https://app.resneo.test' }));
jest.mock('@/lib/sites/useWebDashboardLink', () => ({ useWebDashboardLink: () => (p: string) => p }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

let mockQuery: { isLoading?: boolean; isError?: boolean; error?: unknown; data?: CollectiveSettingsPayload | null; refetch?: () => void };
const mockSave = jest.fn();
let mockSaving = false;
jest.mock('@/lib/queries/useCollectiveSettings', () => ({
  ...jest.requireActual('@/lib/queries/useCollectiveSettings'),
  useCollectiveSettings: () => mockQuery,
  useSaveCollectiveRule: () => ({ mutate: mockSave, isPending: mockSaving }),
}));

function payload(over: { isHost?: boolean; canEdit?: boolean } = {}): CollectiveSettingsPayload {
  const isHost = over.isHost ?? true;
  return {
    collective: {
      id: 'col-1',
      name: 'The Beauty Parlour',
      public_name: 'The Beauty Parlour',
      host_venue_id: 'v-host',
      host_venue_name: "Steph's",
      is_host: isHost,
      live: true,
    },
    can_edit: over.canEdit ?? isHost,
    top_line: isHost
      ? 'These settings apply to every business in The Beauty Parlour.'
      : "Set by Steph's. Ask Steph's to change it.",
    booking_rules: {
      version: 7,
      live: true,
      values: {},
      resolved: {
        require_account_login: false,
        guest_self_reschedule: true,
        waitlist_v2: true,
        any_available_practitioner: true,
        staff_first_booking_flow: false,
      },
      waitlist_mode: 'notify_in_order',
      any_available_practitioner_config: { mode: 'priority', calendar_order: ['c2'] },
      calendars: [
        { id: 'c1', name: 'Ada', venue_name: "Steph's" },
        { id: 'c2', name: 'Ben', venue_name: 'Sage Studio' },
      ],
    },
    page: {
      name: 'The Beauty Parlour',
      public_name: 'The Beauty Parlour',
      public_name_line: 'Guests see it as The Beauty Parlour.',
      path: '/c/beauty-parlour',
      slug: 'beauty-parlour',
      look: { brand_colour: '#003B6F', logo_url: null, cover_photo_url: null, lines: ['Brand colour #003B6F', 'Logo added'] },
      edit_href: isHost ? '/dashboard/settings?tab=booking-page' : null,
    },
    host_details: {
      title: "From Steph's's own details",
      body: "The page shows Steph's's address, phone and opening hours.",
      address: '1 High St',
      phone: null,
      open_days: 5,
      lines: ['Address: 1 High St', 'Phone: not set', 'Opening hours: open 5 days a week'],
      links: isHost ? { profile: '/dashboard/settings?tab=profile', business_hours: '/dashboard/settings?tab=business-hours' } : null,
    },
    clients: { line: 'Sharing client lists: on with 3 of 4 businesses', sharing_count: 3, total_count: 4, on: true, href: '/dashboard/collective?tab=clients' },
    no_show: {
      title: 'No-show protection',
      line: "Clients' cards are saved with The Beauty Parlour and protect bookings with every member, including businesses that join later.",
      members: [
        { venue_id: 'v-host', venue_name: "Steph's", is_host: true },
        { venue_id: 'v-2', venue_name: 'Sage Studio', is_host: false },
      ],
    },
    per_business: {
      venue_id: 'v-host',
      venue_name: "Steph's",
      body: "Each business sets these for itself. This is how Steph's has them.",
      items: [
        { key: 'payments', label: 'Payments and Stripe', value: 'Card payments connected', href: '/dashboard/settings?tab=payments' },
        { key: 'other', label: 'Something new', value: 'On', href: '/dashboard/something-new' },
      ],
    },
  };
}

const onOpenClients = jest.fn();

beforeEach(() => {
  mockSave.mockReset();
  mockPush.mockClear();
  mockOpenBrowser.mockClear();
  onOpenClients.mockClear();
  mockSaving = false;
  mockQuery = { data: payload() };
});

describe('SettingsPanel for the host', () => {
  it('says the settings apply to everyone and shows every part', async () => {
    await render(<SettingsPanel collectiveId="col-1" onOpenClients={onOpenClients} />);
    expect(screen.getByText('These settings apply to every business in The Beauty Parlour.')).toBeTruthy();
    expect(screen.getByText('Booking rules')).toBeTruthy();
    expect(screen.getByText('Guests see it as The Beauty Parlour.')).toBeTruthy();
    expect(screen.getByTestId('collective-settings-address').props.children).toBe(
      'https://app.resneo.test/c/beauty-parlour',
    );
    expect(screen.getByText('Sharing client lists: on with 3 of 4 businesses')).toBeTruthy();
    expect(screen.getByText('No-show protection')).toBeTruthy();
    expect(screen.getByText('Set by each business')).toBeTruthy();
    expect(screen.getByText('Payments and Stripe: Card payments connected')).toBeTruthy();
  });

  it('saves a rule with the version it read, through the same route as Booking settings', async () => {
    mockSave.mockImplementation((_input, opts) => opts.onSuccess());
    await render(<SettingsPanel collectiveId="col-1" onOpenClients={onOpenClients} />);
    await fireEvent(screen.getByLabelText('Staff-first booking'), 'valueChange', true);
    expect(mockSave.mock.calls[0][0]).toEqual({
      route: 'feature-flags',
      patch: { staff_first_booking_flow: true },
      version: 7,
    });
    expect(screen.getByText('Saved for every business in The Beauty Parlour.')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Require sign-in to book'), 'valueChange', true);
    expect(mockSave.mock.calls[1][0]).toEqual({
      route: 'venue',
      patch: { require_account_login_for_bookings: true },
      version: 7,
    });
  });

  it('changes the waitlist mode and the priority order', async () => {
    await render(<SettingsPanel collectiveId="col-1" onOpenClients={onOpenClients} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Offer to all' }));
    expect(mockSave.mock.calls[0][0].patch).toEqual({ waitlist_v2: true, waitlist_config: { mode: 'notify_all' } });
    // Saved order first (Ben), then calendars not yet in it (Ada).
    expect(screen.getByText('1. Ben at Sage Studio')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Move Ada up'));
    expect(mockSave.mock.calls[1][0].patch).toEqual({
      any_available_practitioner: true,
      any_available_practitioner_config: { mode: 'priority', calendar_order: ['c1', 'c2'] },
    });
  });

  it('shows the server words when someone else saved first', async () => {
    const stale = new ApiError("Sage Studio changed this a moment ago. Here is the current setting.", 412, {
      error: "Sage Studio changed this a moment ago. Here is the current setting.",
      code: 'COLLECTIVE_SETTINGS_CHANGED',
    });
    mockSave.mockImplementation((_input, opts) => opts.onError(stale));
    await render(<SettingsPanel collectiveId="col-1" onOpenClients={onOpenClients} />);
    await fireEvent(screen.getByLabelText('Guest self-reschedule'), 'valueChange', false);
    expect(screen.getByTestId('collective-settings-message').props.children).toBe(
      'Sage Studio changed this a moment ago. Here is the current setting.',
    );
  });

  it("opens the app's own screens for the page and the host's details, and the web for the rest", async () => {
    await render(<SettingsPanel collectiveId="col-1" onOpenClients={onOpenClients} />);
    await fireEvent.press(screen.getByText('Edit the page'));
    expect(mockPush).toHaveBeenCalledWith('/manage/booking-page');
    await fireEvent.press(screen.getByText('Open Business hours'));
    expect(mockPush).toHaveBeenCalledWith('/manage/hours');
    await fireEvent.press(screen.getByLabelText('Open Something new'));
    expect(mockOpenBrowser).toHaveBeenCalledWith('https://app.resneo.test/dashboard/something-new');
    await fireEvent.press(screen.getByText('Open Clients'));
    expect(onOpenClients).toHaveBeenCalled();
  });

  it('lists the members under No-show protection on tap', async () => {
    await render(<SettingsPanel collectiveId="col-1" onOpenClients={onOpenClients} />);
    expect(screen.queryByTestId('collective-settings-members')).toBeNull();
    await fireEvent.press(screen.getByText('See members'));
    expect(screen.getByText("Steph's (host)")).toBeTruthy();
    expect(screen.getByText('Sage Studio')).toBeTruthy();
    expect(screen.getByText('Hide members')).toBeTruthy();
  });
});

describe('SettingsPanel for a member', () => {
  beforeEach(() => {
    mockQuery = { data: payload({ isHost: false }) };
  });

  it('shows values as text under who sets them, with no switches', async () => {
    await render(<SettingsPanel collectiveId="col-1" onOpenClients={onOpenClients} />);
    expect(screen.getByText("Set by Steph's. Ask Steph's to change it.")).toBeTruthy();
    expect(screen.queryByLabelText('Staff-first booking')).toBeNull();
    expect(screen.getByText('Require sign-in to book: Off')).toBeTruthy();
    expect(screen.getByText('When a slot opens: First in line, notify in order')).toBeTruthy();
    expect(screen.getByText('Who gets the booking: the first free person in your priority order')).toBeTruthy();
    expect(screen.queryByText('Edit the page')).toBeNull();
    expect(screen.queryByText('Open Profile')).toBeNull();
  });
});

describe('SettingsPanel states', () => {
  it('says the section is not available on an older server', async () => {
    mockQuery = { data: null };
    await render(<SettingsPanel collectiveId="col-1" onOpenClients={onOpenClients} />);
    expect(screen.getByTestId('collective-settings-unavailable')).toBeTruthy();
  });

  it('shows a refusal and tries again', async () => {
    const refetch = jest.fn();
    mockQuery = { isError: true, error: new ApiError('Only venue admins can manage linked accounts.', 403, {}), refetch };
    await render(<SettingsPanel collectiveId="col-1" onOpenClients={onOpenClients} />);
    expect(screen.getByText('Only venue admins can manage linked accounts.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });

  it('maps every web settings link the payload names', () => {
    expect(appRouteForSettingsHref('/dashboard/settings?tab=comms')).toBe('/manage/communications');
    expect(appRouteForSettingsHref('/dashboard/compliance-types')).toBe('/manage/compliance-settings');
    expect(appRouteForSettingsHref('/dashboard/settings?tab=payments')).toBe('/manage/plan');
    expect(appRouteForSettingsHref('/dashboard/unknown')).toBeNull();
    expect(memberRuleLines(payload({ isHost: false }))[0]).toBe('Require sign-in to book: Off');
  });
});
