/**
 * Booking detail "Notes" — web parity (2026-06-26).
 *
 * The web drawer edits each note inline and keeps two scopes distinct:
 *   - booking notes (special_requests / internal_notes) save to THIS booking;
 *   - customer notes (customer_profile_notes) save to the GUEST, so they persist
 *     across every booking for that client.
 * It does NOT bundle guest contact (name / phone / email) into the notes form.
 *
 * These tests pin all three: the right mutation fires for each scope, and the
 * old bundled contact fields are gone.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockUpdateBooking = jest.fn(() => Promise.resolve({}));
const mockUpdateGuest = jest.fn(() => Promise.resolve({}));

jest.mock('@/lib/queries/useBookingMutations', () => ({
  useUpdateBookingDetails: () => ({ mutateAsync: mockUpdateBooking, isPending: false }),
}));
jest.mock('@/lib/queries/useGuestMutations', () => ({
  useUpdateGuest: () => ({ mutateAsync: mockUpdateGuest, isPending: false }),
}));
jest.mock('@/lib/queries/useGuestTags', () => ({
  useGuestTags: () => ({ data: { tags: [] }, isLoading: false }),
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

import { BookingNotesSection } from '@/components/bookings/BookingNotesSection';
import type { BookingDetail } from '@/types/booking-detail';

async function press(node: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(node);
  });
}
async function changeText(node: Parameters<typeof fireEvent.changeText>[0], value: string) {
  await act(async () => {
    fireEvent.changeText(node, value);
  });
}

function makeBooking(overrides: Partial<BookingDetail> = {}): BookingDetail {
  return {
    id: 'bk_1',
    special_requests: 'Window seat',
    internal_notes: null,
    dietary_notes: null,
    occasion: null,
    guest: {
      id: 'g_1',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      phone: '+447700900123',
      tags: [],
      customer_profile_notes: 'VIP',
    },
    ...overrides,
  } as BookingDetail;
}

beforeEach(() => {
  mockUpdateBooking.mockClear();
  mockUpdateGuest.mockClear();
});

describe('BookingNotesSection — web parity', () => {
  it('edits a booking note inline and saves it to THIS booking', async () => {
    await render(<BookingNotesSection booking={makeBooking()} isTable={false} />);

    // Tap the booking-notes value to enter edit mode, change it, and save.
    await press(screen.getByLabelText('Edit booking notes'));
    await changeText(screen.getByDisplayValue('Window seat'), 'Aisle seat');
    await press(screen.getByText('Save'));

    expect(mockUpdateBooking).toHaveBeenCalledTimes(1);
    expect(mockUpdateBooking).toHaveBeenCalledWith({ special_requests: 'Aisle seat' });
    expect(mockUpdateGuest).not.toHaveBeenCalled();
  });

  it('edits customer notes and saves them to the GUEST (persist across bookings)', async () => {
    await render(<BookingNotesSection booking={makeBooking()} isTable={false} />);

    // The persistent-notes scope is clearly labelled and explained.
    expect(screen.getByText('Customer notes')).toBeTruthy();
    expect(screen.getByText('Shown on every booking for this client.')).toBeTruthy();

    await press(screen.getByLabelText('Edit customer notes'));
    await changeText(screen.getByDisplayValue('VIP'), 'VIP, nut allergy');
    await press(screen.getByText('Save'));

    expect(mockUpdateGuest).toHaveBeenCalledTimes(1);
    expect(mockUpdateGuest).toHaveBeenCalledWith({ customer_profile_notes: 'VIP, nut allergy' });
    expect(mockUpdateBooking).not.toHaveBeenCalled();
  });

  it('clearing a note saves null (not an empty string)', async () => {
    await render(<BookingNotesSection booking={makeBooking()} isTable={false} />);

    await press(screen.getByLabelText('Edit booking notes'));
    await changeText(screen.getByDisplayValue('Window seat'), '   ');
    await press(screen.getByText('Save'));

    expect(mockUpdateBooking).toHaveBeenCalledWith({ special_requests: null });
  });

  it('does NOT surface guest contact fields in the notes section (web parity)', async () => {
    await render(<BookingNotesSection booking={makeBooking()} isTable={false} />);

    // The old bundled "Edit" form exposed these — they belong on the contact screen now.
    expect(screen.queryByText('First name')).toBeNull();
    expect(screen.queryByText('Phone')).toBeNull();
    expect(screen.queryByText('Email')).toBeNull();
    expect(screen.queryByDisplayValue('ada@example.com')).toBeNull();
  });

  it('shows the table-only dietary field only for table reservations', async () => {
    await render(<BookingNotesSection booking={makeBooking()} isTable={false} />);
    expect(screen.queryByText('Dietary notes')).toBeNull();
    expect(screen.getByText('Booking notes')).toBeTruthy();

    await screen.rerender(<BookingNotesSection booking={makeBooking()} isTable />);
    expect(screen.getByText('Dietary notes')).toBeTruthy();
    expect(screen.getByText('Guest requests')).toBeTruthy();
  });
});
