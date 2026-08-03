/**
 * BookingLocationCallout — staff-facing "where do I have to be" block on the
 * booking detail (web parity: `BookingLocationCallout`).
 *
 * Exercises:
 *  - gating: nothing at all for business-venue and legacy bookings,
 *  - the client-address branch: address text + tapping it opens Maps,
 *  - the online branch: join link + tapping it opens the meeting,
 *  - each gap's copy, including the pending state that must NOT accuse the venue
 *    of having no meeting link while the full detail is still loading.
 *
 * jest hoists mock factories above imports, so closed-over variables are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { BookingLocationCallout } from '@/components/bookings/BookingLocationCallout';
import { resolveStaffBookingLocation } from '@/lib/booking/staff-booking-location';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/haptics', () => ({ hapticTap: jest.fn() }));

// Spied rather than module-mocked: replacing react-native's own Linking module
// destabilises the rest of the RN registry that RTL renders through.
const mockOpenURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

beforeEach(() => {
  mockOpenURL.mockClear();
});

const ADDRESS_BOOKING = {
  location_type: 'client_address',
  client_address_line1: '12 Elm Row',
  client_address_city: 'Edinburgh',
  client_address_postcode: 'EH7 4AA',
};

describe('BookingLocationCallout', () => {
  it('renders nothing when there is no off-site location', async () => {
    const { toJSON } = await render(<BookingLocationCallout view={null} />);
    expect(toJSON()).toBeNull();
  });

  it('shows the client address and opens Maps when it is tapped', async () => {
    await render(<BookingLocationCallout view={resolveStaffBookingLocation(ADDRESS_BOOKING)} />);

    expect(screen.getByText("At the client's address")).toBeTruthy();
    const address = screen.getByText('12 Elm Row, Edinburgh, EH7 4AA');

    await act(async () => {
      fireEvent.press(address);
    });

    expect(mockOpenURL).toHaveBeenCalledWith(
      expect.stringContaining('https://www.google.com/maps/search/?api=1&query='),
    );
    expect(mockOpenURL).toHaveBeenCalledWith(expect.stringContaining('12%20Elm%20Row'));
  });

  it('asks staff to chase an address that was never recorded', async () => {
    await render(
      <BookingLocationCallout view={resolveStaffBookingLocation({ location_type: 'client_address' })} />,
    );
    expect(screen.getByText(/No address was recorded/)).toBeTruthy();
  });

  it('explains a permission boundary rather than blaming data entry', async () => {
    await render(
      <BookingLocationCallout
        view={resolveStaffBookingLocation({ location_type: 'client_address', addressHidden: true })}
      />,
    );
    expect(screen.getByText(/hidden because this booking belongs to a linked venue/)).toBeTruthy();
  });

  it('shows the join link and joining instructions, and opens the meeting on tap', async () => {
    await render(
      <BookingLocationCallout
        view={resolveStaffBookingLocation({
          location_type: 'online',
          online_meeting_url: 'https://meet.example.com/abc',
          online_meeting_info: 'Dial in five minutes early',
        })}
      />,
    );

    expect(screen.getByText('Online appointment')).toBeTruthy();
    expect(screen.getByText('Dial in five minutes early')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('https://meet.example.com/abc'));
    });

    expect(mockOpenURL).toHaveBeenCalledWith('https://meet.example.com/abc');
  });

  it('flags an online service with no meeting link once the detail has loaded', async () => {
    await render(
      <BookingLocationCallout view={resolveStaffBookingLocation({ location_type: 'online' })} />,
    );
    expect(screen.getByText(/No meeting link is set for this service/)).toBeTruthy();
  });

  it('waits quietly instead of accusing while the summary placeholder is showing', async () => {
    await render(
      <BookingLocationCallout
        view={resolveStaffBookingLocation({ location_type: 'online', detailPending: true })}
      />,
    );
    expect(screen.queryByText(/No meeting link is set/)).toBeNull();
    expect(screen.getByText(/Checking for joining details/)).toBeTruthy();
  });
});
