import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockGuestDetail: { isLoading: boolean; data?: unknown } = { isLoading: false };
jest.mock('@/lib/queries/useGuestDetail', () => ({
  useGuestDetail: () => mockGuestDetail,
}));

let mockLinkedHistory: { isLoading: boolean; isError: boolean; data?: unknown } = {
  isLoading: false,
  isError: false,
};
jest.mock('@/lib/queries/useLinkedGuestHistory', () => ({
  useLinkedGuestHistory: () => mockLinkedHistory,
}));

const mockWriteRebook = jest.fn((_payload: unknown) => Promise.resolve());
jest.mock('@/lib/rebook-bootstrap', () => ({
  writeRebookBootstrap: (payload: unknown) => mockWriteRebook(payload),
}));

import { GuestHistoryBody, LinkedGuestHistoryBody } from '@/components/bookings/detail/GuestHistoryBodies';
import type { LinkedBookingContext } from '@/lib/linked/linked-detail-policy';

const linked = { venueId: 'v2', venueName: 'Partner Studio', act: 'full', pii: true } as unknown as LinkedBookingContext;

describe('GuestHistoryBody', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockWriteRebook.mockClear();
  });

  it('lists the other visits, not this one', async () => {
    mockGuestDetail = {
      isLoading: false,
      data: {
        guest: { first_name: 'Sam', last_name: 'Lee', email: null, phone: null },
        booking_history: [
          { id: 'b1', detail_label: 'This visit', booking_date: '2026-11-27', status: 'Booked' },
          {
            id: 'b0',
            detail_label: 'Cut',
            booking_date: '2026-10-01',
            booking_time: '10:00:00',
            status: 'Completed',
            practitioner_id: 'cal-1',
            appointment_service_id: 's1',
          },
        ],
      },
    };
    await render(<GuestHistoryBody guestId="g1" currentBookingId="b1" />);
    expect(screen.queryByText('This visit')).toBeNull();
    expect(screen.getByText('Cut')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cut'));
    expect(mockPush).toHaveBeenCalledWith('/booking/b0');
  });

  it('rebooks a past visit with its service and person', async () => {
    await render(<GuestHistoryBody guestId="g1" currentBookingId="b1" />);
    await fireEvent.press(screen.getByText('Rebook'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/booking/new' }));
    expect(mockWriteRebook).toHaveBeenCalledWith(
      expect.objectContaining({
        guest: expect.objectContaining({ guestId: 'g1', firstName: 'Sam' }),
        appointment: { serviceId: 's1', practitionerId: 'cal-1', variantId: null },
      }),
    );
  });

  it('says when there is nothing else, and opens the contact', async () => {
    mockGuestDetail = { isLoading: false, data: { guest: null, booking_history: [] } };
    await render(<GuestHistoryBody guestId="g1" currentBookingId="b1" />);
    expect(screen.getByText('No other bookings for this client.')).toBeTruthy();
    await fireEvent.press(screen.getByText('View contact'));
    expect(mockPush).toHaveBeenCalledWith('/client/g1');
  });
});

describe('LinkedGuestHistoryBody', () => {
  beforeEach(() => mockPush.mockClear());

  it('lists the visits at the partner, latest first, and opens one with the link', async () => {
    mockLinkedHistory = {
      isLoading: false,
      isError: false,
      data: {
        bookings: [
          { id: 'l1', booking_item_name: 'Older', booking_date: '2026-09-01', status: 'Completed' },
          { id: 'l2', booking_item_name: 'Newer', booking_date: '2026-10-01', status: 'Completed' },
        ],
      },
    };
    await render(
      <LinkedGuestHistoryBody guestId="g1" currentBookingId="b1" guest={null} linked={linked} canRebook={false} />,
    );
    const names = screen.getAllByText(/Older|Newer/).map((n) => n.props.children);
    expect(names).toEqual(['Newer', 'Older']);
    expect(screen.queryByText('Rebook')).toBeNull();
    await fireEvent.press(screen.getByText('Newer'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/booking/[id]',
      params: {
        id: 'l2',
        linkedAct: 'full',
        linkedVenueId: 'v2',
        linkedVenueName: 'Partner Studio',
        linkedPii: '1',
      },
    });
  });

  it('says when the partner history could not load', async () => {
    mockLinkedHistory = { isLoading: false, isError: true };
    await render(
      <LinkedGuestHistoryBody guestId="g1" currentBookingId="b1" guest={null} linked={linked} canRebook />,
    );
    expect(screen.getByText("Could not load the client's bookings at Partner Studio.")).toBeTruthy();
  });
});
