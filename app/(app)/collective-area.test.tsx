/**
 * The Collective area screen (web /dashboard/collective, 2026-09-17): who may open it, and what a
 * host and a member see on the Services tab.
 */
import { render, screen } from '@testing-library/react-native';

import type { AreaService } from '@/lib/collective-area/model';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

let mockRole = 'admin';
let mockServices: AreaService[] = [];
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ isLoading: false, data: { staff: { role: mockRole } } }),
}));
jest.mock('@/lib/queries/useServicesManage', () => ({
  useManagedServices: () => ({
    isLoading: false,
    isError: false,
    isRefetching: false,
    data: { services: mockServices, collective_calendars: [] },
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

describe('CollectiveAreaScreen', () => {
  beforeEach(() => {
    mockRole = 'admin';
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
    expect(screen.getByText(/^From Host Venue/)).toBeTruthy();
    expect(screen.getByText(/^Parked while you are part of Northside/)).toBeTruthy();
  });
});
