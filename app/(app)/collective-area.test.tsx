/**
 * The Collective area screen (web /dashboard/collective, 2026-09-17): who may open it, and what a
 * host and a member see on the Services tab. Since 2026-10-27 a host also switches to every venue's
 * own services and answers the members' suggestions, and a member suggests its own many at once.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { AreaService, CollectiveCalendarGroup } from '@/lib/collective-area/model';
import type { VenueServicesResponse } from '@/lib/collective-area/venue-services';
import type { WaitingSuggestion } from '@/lib/queries/useCollectiveServiceTools';
import type { CollectiveCandidate, InviteeLinkTodo } from '@/types/collectives';

// A service's sheet opens on the grid; the real one needs the native gesture handler.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

// Choose calendars opens the Services screen's member sheet, which has its own tests.
jest.mock('@/components/collective-area/MemberCalendarsSheet', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    MemberCalendarsSheet: ({ serviceId }: { serviceId: string }) =>
      React.createElement(Text, null, `Calendars sheet for ${serviceId}`),
  };
});

let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

let mockRole = 'admin';
let mockServices: AreaService[] = [];
let mockGroups: CollectiveCalendarGroup[] = [];
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ isLoading: false, data: { staff: { role: mockRole } } }),
}));
jest.mock('@/lib/queries/useServicesManage', () => ({
  useManagedServices: () => ({
    isLoading: false,
    isError: false,
    isRefetching: false,
    data: { services: mockServices, collective_calendars: mockGroups },
    refetch: jest.fn(),
  }),
  // A service's sheet puts it on the page or takes it off straight away (CQ-10.8).
  useOfferServiceOnPage: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useTakeServiceOffPage: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
let mockCollectives: unknown[] = [];
jest.mock('@/lib/queries/useCollectives', () => ({
  useCollectives: () => ({ data: { collectives: mockCollectives }, isRefetching: false, refetch: jest.fn() }),
  useDissolveCollective: () => ({ mutate: jest.fn(), isPending: false }),
  // A member's AdoptionRequestsCard asks for pending same-name questions (web R38).
  useAdoptions: () => ({ data: { adoptions: [] }, isLoading: false }),
  useAdoptionReview: () => ({ data: undefined, isLoading: false }),
  useAnswerAdoption: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
const mockRetry = jest.fn();
// Every change goes through: one answer per op, as the bulk route gives.
const mockBulkSave = jest.fn(async (ops: unknown[]) => ops.map((_op, index) => ({ index, ok: true })));
const mockPatch = jest.fn();
// "Switch it on" (2026-10-28): resolves once the services are read again.
const mockSwitchOn = jest.fn(async (_serviceId: string) => undefined);
jest.mock('@/lib/queries/useCollectiveArea', () => ({
  useCollectiveRetry: () => ({ mutate: mockRetry, isPending: false }),
  useCollectiveBulkSave: () => ({ mutate: jest.fn(), mutateAsync: mockBulkSave, isPending: false }),
  useCollectiveBulkPreview: () => ({ mutate: jest.fn(), isPending: false }),
  useCollectiveMembersPatch: () => ({ mutate: mockPatch, isPending: false }),
  useSwitchServiceOn: () => ({ mutateAsync: mockSwitchOn, isPending: false }),
  useCollectiveHistory: () => ({ data: undefined, isLoading: false }),
  shareHistoryCsv: jest.fn(),
}));
// Venues joining, inviting any venue (2026-10-28).
let mockLinkTodos: InviteeLinkTodo[] = [];
const mockFetchInviteCheck = jest.fn();
let mockCandidates: CollectiveCandidate[] = [];
jest.mock('@/lib/queries/useCollectiveLinks', () => ({
  useLinkTodos: () => ({ data: mockLinkTodos, refetch: jest.fn() }),
  useInviteCheck: () => ({ data: undefined }),
  useCollectiveCandidates: () => ({ data: mockCandidates, isLoading: false, isError: false, refetch: jest.fn() }),
  fetchInviteCheck: (...args: unknown[]) => mockFetchInviteCheck(...args),
}));
jest.mock('@/lib/queries/useLinkedVenues', () => ({
  useVenueSearch: () => ({ data: undefined, isSuccess: false, isFetching: false, isError: false }),
  useVenueLookup: () => ({ data: undefined, isFetching: false }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));
// Every venue's own services (2026-10-27): undefined while loading, null on an older server.
let mockVenueServices: VenueServicesResponse | null | undefined = null;
jest.mock('@/lib/queries/useCollectiveCurate', () => ({
  useVenueServices: () => ({ data: mockVenueServices, isLoading: false, isError: false, refetch: jest.fn() }),
  useCurateServices: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  useDeclineSuggestions: () => ({ mutate: jest.fn(), isPending: false }),
  useSuggestServices: () => ({ mutate: jest.fn(), isPending: false }),
}));
let mockSuggestions: WaitingSuggestion[] = [];
const mockSaveValues = jest.fn();
jest.mock('@/lib/queries/useCollectiveServiceTools', () => ({
  ...jest.requireActual('@/lib/queries/useCollectiveServiceTools'),
  useCollectiveSuggestions: () => ({ data: { role: 'host', suggestions: mockSuggestions } }),
  useSaveCollectiveCalendarValues: () => ({ mutate: mockSaveValues, isPending: false }),
}));
jest.mock('@/lib/queries/useUpdateServiceOverride', () => ({
  useUpdateServiceOverride: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ venue: { currency: 'GBP' } }) }));
const mockToast = { error: jest.fn(), success: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

import { ApiError } from '@/lib/api/client';

import CollectiveAreaScreen from './collective-area';

const block = (role: 'master' | 'replica' | 'parked') => ({
  role,
  collective_id: 'col-1',
  collective_name: 'Northside',
  host_venue_name: 'Host Venue',
  item_id: role === 'parked' ? null : 'item-1',
  locked_fields: [],
  delegated_fields: [],
  status: 'up_to_date' as const,
  status_reason: null,
  last_applied_at: null,
  hidden_reasons: [],
});

const service = (id: string, name: string, overrides: Partial<VenueServicesResponse['venues'][number]['services'][number]> = {}) => ({
  id,
  name,
  duration_minutes: 30,
  price_pence: 2500,
  heading: null,
  bookable_online: true,
  on_page: false,
  item_id: null,
  page_name: null,
  joins: null,
  calendars: 1,
  suggested_at: null,
  ...overrides,
});

const hostView: VenueServicesResponse = {
  role: 'host',
  collective_name: 'Northside',
  host_venue_id: 'v-host',
  host_name: null,
  venues: [
    { venue_id: 'v-host', venue_name: 'Host Venue', is_host: true, services: [service('s1', 'Balayage', { on_page: true })] },
    { venue_id: 'v-zen', venue_name: 'Zen Studio', is_host: false, services: [service('z1', 'Brows')] },
  ],
};

describe('CollectiveAreaScreen', () => {
  beforeEach(() => {
    mockRole = 'admin';
    mockParams = {};
    mockVenueServices = null;
    mockSuggestions = [];
    mockGroups = [];
    mockCollectives = [];
    mockLinkTodos = [];
    mockCandidates = [];
    mockSaveValues.mockReset();
    mockBulkSave.mockClear();
    mockRetry.mockReset();
    mockPatch.mockReset();
    mockSwitchOn.mockReset();
    mockPush.mockClear();
    mockFetchInviteCheck.mockReset();
  });

  it('is for admins only, as on the web', async () => {
    mockRole = 'staff';
    await render(<CollectiveAreaScreen />);
    expect(screen.getByText('Only venue admins can manage a collective.')).toBeTruthy();
  });

  it('says so when the venue is in no collective', async () => {
    mockServices = [{ id: 's1', name: 'Cut', collective: null }];
    await render(<CollectiveAreaScreen />);
    expect(screen.getByText(/not part of a collective yet/)).toBeTruthy();
  });

  it('gives a host the services across the venues, and the Venues tab', async () => {
    mockServices = [{ id: 's1', name: 'Balayage', collective: block('master') }];
    await render(<CollectiveAreaScreen />);
    expect(screen.getByText('Venues')).toBeTruthy();
    expect(screen.getByText('Balayage')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search services')).toBeTruthy();
  });

  it('gives a member its own lists, and no Venues tab', async () => {
    mockServices = [
      { id: 's1', name: 'Balayage', collective: block('replica') },
      { id: 's2', name: 'Old cut', collective: block('parked') },
    ];
    await render(<CollectiveAreaScreen />);
    expect(screen.queryByText('Venues')).toBeNull();
    expect(screen.getByText(/^On the Northside page/)).toBeTruthy();
    expect(screen.getByText(/^Parked while you are part of Northside/)).toBeTruthy();
  });
  it("lets a host switch to every venue's services, with the members' suggestions above (2026-10-27)", async () => {
    mockServices = [{ id: 's1', name: 'Balayage', collective: block('master') }];
    mockVenueServices = hostView;
    mockSuggestions = [
      {
        service_id: 'z1',
        service_name: 'Brows',
        venue_id: 'v-zen',
        venue_name: 'Zen Studio',
        duration_minutes: 30,
        price_pence: 2500,
        suggested_at: '2026-10-27T09:00:00Z',
      },
    ];
    await render(<CollectiveAreaScreen />);
    expect(screen.getByText(/^Suggested by your venues/)).toBeTruthy();
    expect(screen.getByText('Add it')).toBeTruthy();
    // The grid first, as before.
    expect(screen.getByText('On the page')).toBeTruthy();
    expect(screen.getByText('All services')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText("Every venue's services"));
    });
    expect(screen.getByText('All venues')).toBeTruthy();
    expect(screen.getByText('1 of 1 on the page')).toBeTruthy();
    expect(screen.queryByText('All services')).toBeNull();
  });

  it("opens straight onto every venue's services from a bell's link", async () => {
    mockServices = [{ id: 's1', name: 'Balayage', collective: block('master') }];
    mockVenueServices = hostView;
    mockParams = { view: 'venues', venue: 'v-zen', filter: 'suggested' };
    await render(<CollectiveAreaScreen />);
    expect(screen.getByText('All venues')).toBeTruthy();
    expect(screen.queryByText('All services')).toBeNull();
  });

  it("keeps the grid alone on a server without every venue's services", async () => {
    mockServices = [{ id: 's1', name: 'Balayage', collective: block('master') }];
    mockVenueServices = null;
    mockParams = { view: 'venues' };
    await render(<CollectiveAreaScreen />);
    expect(screen.queryByText("Every venue's services")).toBeNull();
    expect(screen.queryByText(/^Suggested by your venues/)).toBeNull();
    expect(screen.getByText('All services')).toBeTruthy();
  });

  it('gives a member its own services to suggest, above its lists', async () => {
    mockServices = [
      { id: 's1', name: 'Balayage', collective: block('replica') },
      { id: 's2', name: 'Old cut', collective: block('parked') },
    ];
    mockVenueServices = {
      role: 'member',
      collective_name: 'Northside',
      host_venue_id: 'v-host',
      host_name: 'Host Venue',
      venues: [{ venue_id: 'v-zen', venue_name: 'Zen Studio', is_host: false, services: [service('s2', 'Old cut')] }],
    };
    await render(<CollectiveAreaScreen />);
    expect(screen.getByText('Your services')).toBeTruthy();
    expect(screen.getByText('Suggest to Host Venue (0)')).toBeTruthy();
    expect(screen.queryByText("Every venue's services")).toBeNull();
    expect(screen.getByText(/^Parked while you are part of Northside/)).toBeTruthy();
  });
  it("lets the host set a member calendar's own values from a service's sheet (2026-10-28)", async () => {
    mockServices = [
      {
        id: 's1',
        name: 'Balayage',
        collective: block('master'),
        duration_minutes: 120,
        buffer_minutes: 0,
        price_pence: 9500,
        payment_requirement: 'none',
        staff_may_customize_price: true,
      },
    ];
    const values = { custom_price_pence: null, custom_duration_minutes: null, custom_buffer_minutes: null, custom_deposit_pence: null };
    mockGroups = [
      {
        venue_id: 'v-zen',
        venue_name: 'Zen Studio',
        is_host: false,
        sync: { venues: 1, applied: 1, pending: [], failed: [] },
        calendars: [
          {
            id: 'cal-m',
            name: 'Mo',
            is_active: true,
            assigned: [{ item_id: 'item-1', service_id: 'replica-1', values, last_changed: null }],
          },
          { id: 'cal-n', name: 'Nia', is_active: true, assigned: [] },
        ],
      },
    ];
    await render(<CollectiveAreaScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Balayage'));
    });
    // Only the calendar that offers it now.
    expect(screen.getAllByLabelText(/^Edit values for/)).toHaveLength(1);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Edit values for Mo'));
    });
    expect(screen.getByText('Balayage on Mo')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Price'), '80');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    expect(mockSaveValues.mock.calls[0]?.[0]).toEqual({
      collectiveId: 'col-1',
      body: { calendar_id: 'cal-m', service_id: 'replica-1', values: { custom_price_pence: 8000 } },
    });
  });
});

describe('CollectiveAreaScreen, 2026-10-28', () => {
  const values = { custom_price_pence: null, custom_duration_minutes: null, custom_buffer_minutes: null, custom_deposit_pence: null };
  const sync = { venues: 1, applied: 1, pending: [], failed: [] };
  // Ada offers Balayage already, Ben does not.
  const hostGroup: CollectiveCalendarGroup = {
    venue_id: 'v-host',
    venue_name: 'Host Venue',
    is_host: true,
    sync,
    calendars: [
      { id: 'c1', name: 'Ada', is_active: true, assigned: [{ item_id: 'item-1', service_id: 's1', values, last_changed: null }] },
      { id: 'c2', name: 'Ben', is_active: true, assigned: [] },
    ],
  };

  beforeEach(() => {
    mockRole = 'admin';
    mockParams = {};
    mockVenueServices = null;
    mockSuggestions = [];
    mockCollectives = [];
    mockLinkTodos = [];
    mockCandidates = [];
    mockGroups = [hostGroup];
    mockServices = [{ id: 's1', name: 'Balayage', collective: block('master') }];
    mockBulkSave.mockClear();
    mockRetry.mockReset();
    mockPatch.mockReset();
    mockSwitchOn.mockReset();
    mockPush.mockClear();
    mockFetchInviteCheck.mockReset();
  });

  it('chooses calendars for the services picked, and saves only what changes', async () => {
    mockServices = [
      { id: 's1', name: 'Balayage', collective: block('master') },
      { id: 's2', name: 'Old cut', collective: block('parked') },
    ];
    await render(<CollectiveAreaScreen />);
    // Nothing picked: no bulk buttons.
    expect(screen.queryByRole('button', { name: 'Choose calendars' })).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Select' }));
    });
    expect(screen.queryByRole('button', { name: 'Choose calendars' })).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Balayage'));
    });
    // On the page already, so it can only come off.
    expect(screen.getByRole('button', { name: 'Take off the page' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Put on the page' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Choose calendars' }));
    });
    expect(screen.getByText('For Balayage.')).toBeTruthy();
    expect(screen.getByLabelText('Ada at Host Venue').props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByLabelText('Ben at Host Venue').props.accessibilityState).toMatchObject({ checked: false });
    // Ticking Ada again changes nothing, so nothing is offered to save.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Ben at Host Venue'));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save 1 change' }));
    });
    expect(mockBulkSave).toHaveBeenCalledWith([{ op: 'assign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c2' }]);
    // Adding calendars goes straight through, and can be undone for a minute (CQ-11).
    expect(screen.getByText('Saved 1 change.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Undo \(\d+s\)$/ })).toBeTruthy();
    expect(screen.queryByText('For Balayage.')).toBeNull();
  });

  it("saves a service's calendar ticks from its own sheet, and Cancel drops them", async () => {
    await render(<CollectiveAreaScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Balayage'));
    });
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    await act(async () => {
      fireEvent(screen.getByLabelText('Ben at Host Venue'), 'valueChange', true);
    });
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(mockBulkSave).not.toHaveBeenCalled();
    expect(screen.queryByText('1 not saved')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Balayage'));
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Ben at Host Venue'), 'valueChange', true);
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    expect(mockBulkSave).toHaveBeenCalledWith([{ op: 'assign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c2' }]);
  });

  it('says a service switched off at the host cannot be booked, and switches it on right there', async () => {
    mockServices = [
      { id: 's1', name: 'Balayage', collective: block('master'), is_active: false },
      { id: 's2', name: 'Old cut', collective: block('parked'), is_active: false },
    ];
    await render(<CollectiveAreaScreen />);
    expect(
      screen.getByText('Switched off on your Services page, so nobody can book it at any venue, even though it is on the page.'),
    ).toBeTruthy();
    expect(screen.getByText('Hidden from guests')).toBeTruthy();
    // A parked one switched off says both, and has no switch of its own.
    expect(screen.getByText('Parked, switched off')).toBeTruthy();
    expect(screen.queryByLabelText('Switch it on: Old cut')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Switch it on: Balayage'));
    });
    expect(mockSwitchOn).toHaveBeenCalledWith('s1');
    // What needs you says so too, with the same switch (CQ-13).
    expect(
      screen.getByText('Balayage is switched off on your Services page, so nobody can book it at any venue.'),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Switch it on' }));
    });
    expect(mockSwitchOn).toHaveBeenLastCalledWith('s1');
    expect(mockSwitchOn).toHaveBeenCalledTimes(2);
    // The filter counts it before it is opened.
    await act(async () => {
      fireEvent.press(screen.getByText('Needs attention (1)'));
    });
    expect(screen.getByText('Balayage')).toBeTruthy();
  });

  it('shows on the row why a service did not switch on', async () => {
    mockServices = [{ id: 's1', name: 'Balayage', collective: block('master'), is_active: false }];
    mockSwitchOn.mockRejectedValueOnce(new ApiError('Add a calendar to this service before switching it on.', 400));
    await render(<CollectiveAreaScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Switch it on: Balayage'));
    });
    expect(screen.getByText('Add a calendar to this service before switching it on.')).toBeTruthy();
  });

  it('runs the updates of a venue that is behind with Update now', async () => {
    mockGroups = [
      hostGroup,
      {
        venue_id: 'v-zen',
        venue_name: 'Zen Studio',
        is_host: false,
        sync: { venues: 1, applied: 0, pending: [{ venue_id: 'v-zen', venue_name: 'Zen Studio' }], failed: [] },
        calendars: [{ id: 'c3', name: 'Cy', is_active: true, assigned: [{ item_id: 'item-1', service_id: 'r1', values, last_changed: null }] }],
      },
    ];
    await render(<CollectiveAreaScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Update now: Zen Studio'));
    });
    expect(mockRetry.mock.calls[0]?.[0]).toBe('v-zen');
    // Regression (CQ-11): Update now said nothing when it went through.
    await act(async () => {
      mockRetry.mock.calls[0]?.[1]?.onSuccess?.({ collective_sync: { venues: 1, applied: 1, pending: [], failed: [] } });
    });
    expect(mockToast.success).toHaveBeenCalledWith('Zen Studio is up to date.');
    await act(async () => {
      mockRetry.mock.calls[0]?.[1]?.onSuccess?.({
        collective_sync: { venues: 1, applied: 0, pending: [{ venue_id: 'v-zen', venue_name: 'Zen Studio' }], failed: [] },
      });
    });
    expect(mockToast.info).toHaveBeenCalledWith('Zen Studio is still updating. We will keep trying.');
  });

  // Regression (CQ-10.7): the new venue's row had no button, so the host could not act on it here.
  it("opens Choose calendars for a new venue's calendars from What needs you", async () => {
    mockGroups = [
      hostGroup,
      {
        venue_id: 'v-zen',
        venue_name: 'Zen Studio',
        is_host: false,
        sync,
        calendars: [{ id: 'c3', name: 'Cy', is_active: true, assigned: [] }],
      },
    ];
    await render(<CollectiveAreaScreen />);
    expect(screen.getByText('Zen Studio has joined. Choose their calendars on 1 service.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Choose calendars' }));
    });
    expect(screen.getByText('For Balayage.')).toBeTruthy();
    expect(screen.getByLabelText('Cy at Zen Studio')).toBeTruthy();
    expect(screen.queryByLabelText('Ada at Host Venue')).toBeNull();
    // The venue alone picked: never the page buttons (CQ-03).
    expect(screen.queryByRole('button', { name: 'Take off the page' })).toBeNull();
  });

  it("marks the host's own venue (you) on the Venues tab (CQ-07)", async () => {
    mockCollectives = [
      {
        id: 'col-1',
        name: 'Northside',
        hostVenueId: 'v-host',
        myVenueId: 'v-host',
        serviceModel: 'replicas',
        members: [
          { venueId: 'v-host', venueName: 'Aura Hair Studio', status: 'active' },
          { venueId: 'v-zen', venueName: 'Aura Hair Studio in Holywood', status: 'active' },
        ],
      },
    ];
    await render(<CollectiveAreaScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Venues'));
    });
    expect(screen.getByText('Aura Hair Studio (you)')).toBeTruthy();
    expect(screen.getByText('Aura Hair Studio in Holywood')).toBeTruthy();
  });

  // CQ-10.3 (R2-21): right after Create, or when the only member leaves, nothing is parked or on the
  // page, so the services carry no collective. The host used to read "No collective" here.
  it('opens a host with nothing on the page and no other venue on Venues, from the collectives list', async () => {
    mockServices = [{ id: 's1', name: 'Cut', collective: null }];
    mockCollectives = [
      {
        id: 'col-1',
        name: 'Northside',
        status: 'active',
        isHost: true,
        hostVenueId: 'v-host',
        myVenueId: 'v-host',
        serviceModel: 'replicas',
        activeMemberCount: 1,
        members: [
          { venueId: 'v-host', venueName: 'Host Venue', status: 'active' },
          { venueId: 'v-zen', venueName: 'Zen Studio', status: 'invited' },
        ],
      },
    ];
    await render(<CollectiveAreaScreen />);
    expect(screen.queryByText(/not part of a collective yet/)).toBeNull();
    expect(screen.getByText('Northside')).toBeTruthy();
    // On Venues: invite a venue, or end it.
    expect(screen.getByRole('button', { name: 'Invite a venue' })).toBeTruthy();
    expect(screen.getByText('Host Venue (you)')).toBeTruthy();
  });

  it("opens on Venues from Manage combined page's pointer (tab=venues)", async () => {
    mockServices = [{ id: 's1', name: 'Balayage', collective: block('master') }];
    mockParams = { tab: 'venues' };
    mockCollectives = [
      {
        id: 'col-1',
        name: 'Northside',
        hostVenueId: 'v-host',
        myVenueId: 'v-host',
        serviceModel: 'replicas',
        members: [{ venueId: 'v-host', venueName: 'Host Venue', status: 'active' }],
      },
    ];
    await render(<CollectiveAreaScreen />);
    expect(screen.getByRole('button', { name: 'Invite a venue' })).toBeTruthy();
    expect(screen.queryByText('Balayage')).toBeNull();
  });

  it('opens Choose calendars on this screen when a member taps a page service (2026-10-29)', async () => {
    mockGroups = [];
    mockServices = [
      { id: 's1', name: 'Balayage', collective: block('replica') },
      { id: 's2', name: 'Old cut', collective: block('parked') },
    ];
    await render(<CollectiveAreaScreen />);
    expect(screen.queryByText('Open Services')).toBeNull();
    expect(screen.queryByText(/Calendars sheet for/)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Choose calendars for Balayage'));
    });
    expect(screen.getByText('Calendars sheet for s1')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    // A parked service is not on the page: nothing to choose there.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Parked while you are part of Northside (1)'));
    });
    expect(screen.queryByLabelText('Choose calendars for Old cut')).toBeNull();
  });

  it("folds a member's parked and retired lists until opened", async () => {
    mockGroups = [];
    mockServices = [
      { id: 's1', name: 'Balayage', collective: block('replica') },
      { id: 's2', name: 'Old cut', collective: block('parked') },
      { id: 's3', name: 'Brows', collective: block('replica'), is_active: false },
    ];
    await render(<CollectiveAreaScreen />);
    expect(screen.getByText('Balayage')).toBeTruthy();
    // Switched off by the host: said instead of the sync badge (web 2026-10-28).
    expect(screen.getByText('Switched off by Host Venue, so nobody can book it')).toBeTruthy();
    expect(screen.queryByText('Old cut')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Parked while you are part of Northside (1)'));
    });
    expect(screen.getByText('Old cut')).toBeTruthy();
    expect(screen.getByText(/tick them under Your services and send them to Host Venue\.$/)).toBeTruthy();
    // A member can leave from here, now the More tab shows one collective row.
    expect(screen.getByRole('button', { name: 'Leave Northside' })).toBeTruthy();
  });

  it('shows under Venues joining only a link this venue set to less than full access, with the way to change it', async () => {
    const todo = (venue: string, state: InviteeLinkTodo['state']): InviteeLinkTodo => ({
      collective_id: 'col-1',
      collective_name: 'Northside',
      venue_id: `v-${venue}`,
      venue_name: venue,
      venue_slug: venue.toLowerCase(),
      state,
      link_id: state === 'none' ? null : `link-${venue}`,
    });
    mockLinkTodos = [todo('Light', 'none'), todo('Oak', 'my_request'), todo('Ash', 'their_request'), todo('Elm', 'not_full')];
    await render(<CollectiveAreaScreen />);
    expect(screen.getByText('Venues joining')).toBeTruthy();
    expect(
      screen.getByText(
        'Elm is invited to join Northside, but your link with them gives less than full access both ways, so they cannot join until you change it.',
      ),
    ).toBeTruthy();
    // Every other link is made as they join, so there is nothing to press for them.
    expect(screen.queryByText(/^(Light|Oak|Ash) is invited/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Link with / })).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Change it in Linked venues: Elm'));
    });
    expect(mockPush).toHaveBeenCalledWith('/linked-venues');
  });

  it('shows nothing under Venues joining when every link is made as they join', async () => {
    mockLinkTodos = [
      { collective_id: 'col-1', collective_name: 'Northside', venue_id: 'v-oak', venue_name: 'Oak', venue_slug: 'oak', state: 'my_request', link_id: 'l' },
      { collective_id: 'col-1', collective_name: 'Northside', venue_id: 'v-ash', venue_name: 'Ash', venue_slug: 'ash', state: 'none', link_id: null },
    ];
    await render(<CollectiveAreaScreen />);
    expect(screen.queryByText('Venues joining')).toBeNull();
  });

  it('invites any venue from the Venues tab, showing what joining takes first', async () => {
    mockCollectives = [
      {
        id: 'col-1',
        name: 'Northside',
        hostVenueId: 'v-host',
        myVenueId: 'v-host',
        serviceModel: 'replicas',
        members: [
          { venueId: 'v-host', venueName: 'Host Venue', status: 'active' },
          { venueId: 'v-zen', venueName: 'Zen Studio', status: 'active' },
        ],
      },
    ];
    mockCandidates = [
      { venue_id: 'v-light', venue_name: 'Light 3', venue_slug: 'light-3', link_id: 'l1', standing: 'ok', reason: null, detail: null },
      { venue_id: 'v-far', venue_name: 'Far Away', venue_slug: 'far', link_id: 'l2', standing: 'blocked', reason: 'In Europe/Paris, not Europe/London', detail: null },
    ];
    mockFetchInviteCheck.mockResolvedValue({
      venue: { id: 'v-light', name: 'Light 3', slug: 'light-3' },
      already: null,
      standing: { standing: 'ok', reason: null, detail: null },
      links: [
        { venue_id: 'v-host', venue_name: 'Host Venue', venue_slug: 'host', is_host: true, state: 'full', link_id: 'l1' },
        { venue_id: 'v-zen', venue_name: 'Zen Studio', venue_slug: 'zen', is_host: false, state: 'none', link_id: null },
      ],
    });
    await render(<CollectiveAreaScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Venues'));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Invite a venue' }));
    });
    expect(screen.getByText('Invite a venue to Northside')).toBeTruthy();
    // A venue that cannot join says why, and cannot be chosen.
    expect(screen.getByText('In Europe/Paris, not Europe/London')).toBeTruthy();
    expect(screen.queryByLabelText('Choose Far Away')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Choose Light 3'));
    });
    expect(mockFetchInviteCheck.mock.calls[0]?.[2]).toEqual({ venueId: 'v-light' });
    expect(screen.getByText('Linked with Light 3 when they join.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Invite Light 3' }));
    });
    expect(mockPatch.mock.calls[0]?.[0]).toEqual({ action: 'invite', venueId: 'v-light' });
    await act(async () => {
      mockPatch.mock.calls[0]?.[1]?.onSuccess?.();
    });
    expect(
      screen.getByText(
        'Invitation sent to Light 3. When they accept it, they are linked with every venue here and join, in one step.',
      ),
    ).toBeTruthy();
  });
});
