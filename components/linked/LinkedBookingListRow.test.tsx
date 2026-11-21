/**
 * A partner's booking in the Appointments list writes its time as the list's own rows do ("14:00"):
 * "11:30am" wrapped to "11:30a / m" in the narrow time column (phone QA 2026-11-21).
 */
import { render, screen } from '@testing-library/react-native';

import { LinkedBookingListRow } from '@/components/linked/LinkedBookingListRow';
import type { LinkedBooking } from '@/types/linked-venues';

jest.mock('@/lib/haptics', () => ({ hapticTap: jest.fn(), hapticSelect: jest.fn() }));

const booking = {
  id: 'b-1',
  bookingDate: '2026-12-21',
  bookingTime: '11:30:00',
  status: 'Booked',
  guestName: 'Ada Lovelace',
  serviceName: 'Root Tint',
} as unknown as LinkedBooking;

describe('LinkedBookingListRow', () => {
  it('shows a 24-hour time', async () => {
    await render(
      <LinkedBookingListRow booking={booking} venueName="Jenny at Aura" visibility="full_details" onPress={jest.fn()} />,
    );
    expect(screen.getByText('11:30')).toBeTruthy();
    expect(screen.queryByText('11:30am')).toBeNull();
  });
});
