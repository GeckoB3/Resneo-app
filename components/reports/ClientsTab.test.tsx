/**
 * ClientsTab — Reports → Clients sub-tab directory.
 *
 * This suite covers the R7 tag-filter addition specifically: a chip row backed
 * by `useGuestTags`, which toggles `segment='tag'`/`segmentTag` into the
 * `useGuests` query (and clears it when the active chip is tapped again).
 *
 * jest hoists mock factories above imports, so every closed-over variable is
 * prefixed `mock*`. The two query hooks are mocked so the render is
 * deterministic and we can inspect the params the chip presses produce.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { GuestListParams } from '@/types/guest-list';

// Chip + SearchBar render expo-symbols glyphs — stub to a host element.
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

// Venue tags that back the filter chip row.
let mockTags: string[];
jest.mock('@/lib/queries/useGuestTags', () => ({
  useGuestTags: () => ({ data: { tags: mockTags } }),
}));

// useGuests — capture every call's params so we can assert the chip wiring.
const mockUseGuestsCalls: GuestListParams[] = [];
jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: (params: GuestListParams) => {
    mockUseGuestsCalls.push(params);
    return {
      data: {
        guests: [
          {
            id: 'g1',
            first_name: 'Ada',
            last_name: 'Lovelace',
            email: 'ada@example.com',
            phone: null,
            tags: ['vip'],
            visit_count: 3,
            no_show_count: 0,
            last_visit_date: '2026-06-01',
            next_booking_date: null,
            next_booking_time: null,
            total_bookings: 3,
            upcoming_booking_count: 0,
          },
        ],
        total: 1,
        total_count: 1,
        page: 0,
        limit: 25,
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    };
  },
}));

// Detail-only hooks — never invoked unless a row is expanded (this suite does
// not expand), but the module must resolve.
jest.mock('@/lib/queries/useGuestDetail', () => ({
  useGuestDetail: () => ({ data: undefined, isLoading: false, isError: false }),
}));
jest.mock('@/lib/queries/useGuestMutations', () => ({
  useUpdateGuest: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useEraseGuest: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import { ClientsTab } from '@/components/reports/ClientsTab';

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
  jest.clearAllMocks();
});

describe('ClientsTab tag filter', () => {
  it('renders a chip for each venue tag', async () => {
    mockTags = ['vip', 'regular'];
    await render(<ClientsTab />);
    expect(screen.getByText('vip')).toBeTruthy();
    expect(screen.getByText('regular')).toBeTruthy();
  });

  it('does not render a tag row when the venue has no tags', async () => {
    mockTags = [];
    await render(<ClientsTab />);
    // No chips → the guests query carries no tag segment.
    expect(lastGuestsParams().segment).toBeUndefined();
    expect(lastGuestsParams().segmentTag).toBeUndefined();
  });

  it('passes no tag segment to useGuests before any chip is pressed', async () => {
    mockTags = ['vip'];
    await render(<ClientsTab />);
    expect(lastGuestsParams().segment).toBeUndefined();
    expect(lastGuestsParams().segmentTag).toBeUndefined();
  });

  it('toggles segment=tag + segmentTag into useGuests when a chip is pressed', async () => {
    mockTags = ['vip', 'regular'];
    await render(<ClientsTab />);

    await press(() => screen.getByText('vip'));

    const params = lastGuestsParams();
    expect(params.segment).toBe('tag');
    expect(params.segmentTag).toBe('vip');
  });

  it('clears the filter when the active chip is pressed again (toggle off)', async () => {
    mockTags = ['vip'];
    await render(<ClientsTab />);

    await press(() => screen.getByText('vip')); // select
    expect(lastGuestsParams().segmentTag).toBe('vip');

    await press(() => screen.getByText('vip')); // same chip → clear
    const params = lastGuestsParams();
    expect(params.segment).toBeUndefined();
    expect(params.segmentTag).toBeUndefined();
  });
});
