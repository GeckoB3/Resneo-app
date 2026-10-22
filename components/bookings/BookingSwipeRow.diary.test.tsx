/**
 * The Bookings list's swipe actions and other people's diaries (web roles plan §5.11, §7.3). A
 * View only or Hidden person gets no Accept or No-show swipe on someone else's appointment (the
 * server refuses both with DIARY_VIEW_ONLY); the row still opens it. Their own appointments, and
 * everyone on "Can book and change", keep the swipes.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: { timezone: 'Europe/London', no_show_grace_minutes: 15 } }),
}));
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useUpdateBookingStatus: () => ({ mutate: jest.fn(), isPending: false }),
}));
// The row and the swipe container have suites of their own: here they say what they were given.
jest.mock('@/components/bookings/BookingRow', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { BookingRow: ({ booking }: { booking: { guest_name: string } }) => <Text>{booking.guest_name}</Text> };
});
jest.mock('@/components/ui/SwipeRow', () => {
  const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SwipeRow: ({ rightActions, children }: { rightActions: { label: string }[]; children: ReactNode }) => (
      <View>
        {children}
        {rightActions.map((a) => (
          <Text key={a.label}>{`swipe:${a.label}`}</Text>
        ))}
      </View>
    ),
  };
});

import { BookingSwipeRow } from '@/components/bookings/BookingSwipeRow';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';
import type { ViewerAccess } from '@/lib/roles/roles';
import type { BookingListRow } from '@/types/booking-list';

const VIEW_ONLY: ViewerAccess = {
  canSeeClientContact: true,
  canExportClients: true,
  otherDiaries: 'view',
  ownCalendarIds: ['cal_mine'],
};
const BOOK: ViewerAccess = { canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' };

function row(overrides: Partial<BookingListRow> = {}): BookingListRow {
  return {
    id: 'bk_1',
    booking_date: '2030-01-10',
    booking_time: '10:00:00',
    party_size: 1,
    status: 'Pending',
    guest_name: 'Ada Lovelace',
    deposit_status: null,
    calendar_id: 'cal_theirs',
    ...overrides,
  };
}

async function renderAs(access: ViewerAccess, booking: BookingListRow) {
  await render(
    <ViewerAccessProvider value={access}>
      <BookingSwipeRow booking={booking} isAppointment onPress={jest.fn()} />
    </ViewerAccessProvider>,
  );
}

describe('BookingSwipeRow and other people\'s diaries', () => {
  it("offers no swipe on someone else's appointment to a View only person, and still lists it", async () => {
    await renderAs(VIEW_ONLY, row());
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.queryByText('swipe:Accept')).toBeNull();
  });

  it('keeps the swipe on their own appointment', async () => {
    await renderAs(VIEW_ONLY, row({ calendar_id: 'cal_mine' }));
    expect(screen.getByText('swipe:Accept')).toBeTruthy();
  });

  it('keeps it on a class, which View only does not cover', async () => {
    await renderAs(VIEW_ONLY, row({ class_instance_id: 'ci_1' }));
    expect(screen.getByText('swipe:Accept')).toBeTruthy();
  });

  it('keeps it for everyone on Can book and change', async () => {
    await renderAs(BOOK, row());
    expect(screen.getByText('swipe:Accept')).toBeTruthy();
  });
});
