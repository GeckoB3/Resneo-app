/**
 * The Collective area screen (web /dashboard/collective, 2026-09-17): who may open it, and what a
 * host and a member see on the Services tab. Since 2026-10-27 a host also switches to every venue's
 * own services and answers the members' suggestions, and a member suggests its own many at once.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { AreaService, CollectiveCalendarGroup } from '@/lib/collective-area/model';
import type { VenueServicesResponse } from '@/lib/collective-area/venue-services';
import type { WaitingSuggestion } from '@/lib/queries/useCollectiveServiceTools';

// A service's sheet opens on the grid; the real one needs the native gesture handler.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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
}));
jest.mock('@/lib/queries/useCollectives', () => ({
  useCollectives: () => ({ data: { collectives: [] }, isRefetching: false, refetch: jest.fn() }),
  useDissolveCollective: () => ({ mutate: jest.fn(), isPending: false }),
  // A member's AdoptionRequestsCard asks for pending same-name questions (web R38).
  useAdoptions: () => ({ data: { adoptions: [] }, isLoading: false }),
  useAdoptionReview: () => ({ data: undefined, isLoading: false }),
  useAnswerAdoption: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useCollectiveArea', () => ({
  useCollectiveRetry: () => ({ mutate: jest.fn(), isPending: false }),
  useCollectiveBulkSave: () => ({ mutate: jest.fn(), isPending: false }),
  useCollectiveBulkPreview: () => ({ mutate: jest.fn(), isPending: false }),
  useCollectiveMembersPatch: () => ({ mutate: jest.fn(), isPending: false }),
  useCollectiveHistory: () => ({ data: undefined, isLoading: false }),
  shareHistoryCsv: jest.fn(),
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
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ error: jest.fn(), success: jest.fn() }) }));

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
    mockSaveValues.mockReset();
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
