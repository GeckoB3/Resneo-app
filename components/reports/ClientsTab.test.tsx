/**
 * ClientsTab — Reports → Clients directory.
 *
 * Covers what the list asks the guests route for (identity scope, sort, tags)
 * and what a row shows, against the web's own list
 * (_reference/Resneo/src/app/dashboard/reports/ClientsSection.tsx).
 *
 * jest hoists mock factories above imports, so every closed-over variable is
 * prefixed `mock*`. The query hooks are mocked so the render is deterministic
 * and we can inspect the params each control produces.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { GuestListItem, GuestListParams } from '@/types/guest-list';

// Chip + SearchBar render expo-symbols glyphs — stub to a host element.
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

// Venue tags that back the filter chip row.
let mockTags: string[];
jest.mock('@/lib/queries/useGuestTags', () => ({
  useGuestTags: () => ({ data: { tags: mockTags } }),
}));

// useGuests — capture every call's params so we can assert the control wiring.
const mockUseGuestsCalls: GuestListParams[] = [];
let mockGuest: GuestListItem;
jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: (params: GuestListParams) => {
    mockUseGuestsCalls.push(params);
    return {
      data: { guests: [mockGuest], total: 1, total_count: 1, page: 0, limit: 25 },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    };
  },
}));

// Detail hooks — only used once a row is expanded.
const mockDetail: { data: unknown; isLoading: boolean; isError: boolean } = {
  data: undefined,
  isLoading: false,
  isError: false,
};
jest.mock('@/lib/queries/useGuestDetail', () => ({ useGuestDetail: () => mockDetail }));
jest.mock('@/lib/queries/useGuestMutations', () => ({
  useUpdateGuest: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useEraseGuest: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/components/clients/GuestTagEditor', () => ({ GuestTagEditor: () => null }));
jest.mock('@/lib/reports/csv-export', () => ({
  buildAndShareCsv: jest.fn(async () => ({ ok: true })),
}));

import { ClientsTab } from '@/components/reports/ClientsTab';
import { buildAndShareCsv } from '@/lib/reports/csv-export';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

/** The params the most recent `useGuests` render received. */
function lastGuestsParams(): GuestListParams {
  return mockUseGuestsCalls[mockUseGuestsCalls.length - 1];
}

beforeEach(() => {
  mockUseGuestsCalls.length = 0;
  mockDetail.data = undefined;
  mockTags = ['vip', 'regular'];
  mockGuest = {
    id: 'g1',
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    phone: '07700 900123',
    tags: ['vip'],
    visit_count: 3,
    no_show_count: 2,
    last_visit_date: '2026-06-01',
    next_booking_date: null,
    next_booking_time: null,
    total_bookings: 5,
    upcoming_booking_count: 0,
  };
  jest.clearAllMocks();
});

describe('ClientsTab list controls', () => {
  it('asks for the web default scope and sort', async () => {
    await render(<ClientsTab clientWord="Client" bookingWord="Appointment" isAppointment />);
    const params = lastGuestsParams();
    expect(params.filter).toBe('identified');
    expect(params.sort).toBe('last_visit_desc');
    expect(params.tags).toBeUndefined();
  });

  it('switches the identity scope from the Show chips', async () => {
    await render(<ClientsTab />);
    await press(() => screen.getByText('All except walk-ins'));
    expect(lastGuestsParams().filter).toBe('all');
    await press(() => screen.getByText('Walk-ins only'));
    expect(lastGuestsParams().filter).toBe('anonymous');
  });

  it('offers the web’s six sorts and sends the one chosen', async () => {
    await render(<ClientsTab />);
    for (const label of [
      'Last visit (newest)',
      'Last visit (oldest)',
      'Name (A–Z)',
      'Name (Z–A)',
      'Most visits',
      'Recently added',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    await press(() => screen.getByText('Most visits'));
    expect(lastGuestsParams().sort).toBe('visit_count_desc');
  });

  it('stacks tag filters and drops one when its chip is tapped again', async () => {
    await render(<ClientsTab />);
    await press(() => screen.getByText('vip'));
    expect(lastGuestsParams().tags).toEqual(['vip']);
    await press(() => screen.getByText('regular'));
    expect(lastGuestsParams().tags).toEqual(['vip', 'regular']);
    await press(() => screen.getByText('vip'));
    expect(lastGuestsParams().tags).toEqual(['regular']);
  });

  it('renders no tag row, and sends no tags, when the venue has none', async () => {
    mockTags = [];
    await render(<ClientsTab />);
    expect(screen.queryByText('Filter by tags')).toBeNull();
    expect(lastGuestsParams().tags).toBeUndefined();
  });
});

describe('ClientsTab rows', () => {
  it('shows phone, the lifecycle count and the no-show badge', async () => {
    await render(<ClientsTab clientWord="Client" bookingWord="Appointment" isAppointment />);
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('ada@example.com · 07700 900123')).toBeTruthy();
    expect(screen.getByText('Total appointments: 5')).toBeTruthy();
    expect(screen.getByText('Appointments (lifecycle): 3')).toBeTruthy();
    expect(screen.getByText('2 NS')).toBeTruthy();
    expect(screen.getByText('Last visit: 2026-06-01')).toBeTruthy();
  });

  it('calls a row with no name on it Guest', async () => {
    mockGuest = { ...mockGuest, first_name: null, last_name: null };
    await render(<ClientsTab />);
    expect(screen.getByText('Guest')).toBeTruthy();
  });

  it('calls a walk-in row Anonymous', async () => {
    mockGuest = { ...mockGuest, identifiability_tier: 'anonymous' };
    await render(<ClientsTab />);
    expect(screen.getByText('Anonymous')).toBeTruthy();
  });
});

describe('ClientsTab guest history export', () => {
  it('uses the web’s columns, deposit status and filename', async () => {
    mockDetail.data = {
      guest: {
        id: 'g1',
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
        phone: '07700 900123',
        tags: [],
      },
      stats: {
        total_bookings: 5,
        no_shows: 2,
        cancellations: 1,
        total_deposit_pence_paid: 0,
      },
      booking_history: [
        {
          id: 'b1',
          booking_date: '2026-06-01',
          booking_time: '10:30',
          party_size: 2,
          status: 'Completed',
          deposit_status: 'Paid',
          booking_model: 'unified_scheduling',
          kind_label: 'Appointment',
          detail_label: 'Cut & finish',
          practitioner_name: 'Hannah',
          service_name: 'Cut & finish',
          area_name: null,
        },
      ],
    };

    await render(<ClientsTab clientWord="Client" bookingWord="Appointment" isAppointment />);
    await press(() => screen.getByText('Ada Lovelace'));
    await press(() => screen.getByText('Export history (CSV)'));

    expect(buildAndShareCsv).toHaveBeenCalledWith('guest-g1-bookings.csv', [
      ['Date', 'Time', 'Service', 'Covers', 'Status', 'Deposit', 'Practitioner'],
      ['2026-06-01', '10:30', 'Cut & finish', '2', 'Completed', 'Paid', 'Hannah'],
    ]);
  });
});
