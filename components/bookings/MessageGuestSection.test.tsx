/**
 * Booking detail "SMS / Email guest" section — web parity (2026-06-26).
 *
 * Pins the behaviours that diverged from the web before this change:
 *   - the section stays VISIBLE for a contactless guest (web always shows it);
 *   - the composer sends { message, channel } via the booking-message mutation,
 *     on the web's default channel ("Email & SMS (if available)");
 *   - a booking with no guest row is still reachable on its own `guest_email`;
 *   - a partial send (200 + errors[]) surfaces as "Partially sent …";
 *   - the log row reads the web message-type label, "To <recipient>", and only
 *     shows an error line for a failed row.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockMutate = jest.fn();
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useSendBookingMessage: () => ({ mutate: mockMutate, isPending: false }),
}));

import { MessageGuestSection } from '@/components/bookings/MessageGuestSection';
import { ApiError } from '@/lib/api/client';
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
    guest_id: 'g_1',
    guest: {
      id: 'g_1',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      phone: '+447700900123',
    },
    communications: [],
    ...overrides,
  } as BookingDetail;
}

/** Expand the collapsible section so its body (composer/log) renders. */
async function expand() {
  await press(screen.getByLabelText('SMS / Email guest'));
}

beforeEach(() => {
  mockMutate.mockReset();
});

describe('MessageGuestSection — web parity', () => {
  it('hides entirely only when there is no guest and nothing was ever sent', async () => {
    await render(
      <MessageGuestSection booking={makeBooking({ guest: null, guest_id: '', communications: [] })} />,
    );
    expect(screen.queryByText('SMS / Email guest')).toBeNull();
  });

  it('stays VISIBLE for a contactless guest and shows a no-contact note (not a composer)', async () => {
    await render(
      <MessageGuestSection
        booking={makeBooking({
          guest: { id: 'g_1', first_name: 'Ada', last_name: 'L', email: null, phone: null },
        })}
      />,
    );
    // The section header is present even with no email/phone (the old gate hid it).
    expect(screen.getByText('SMS / Email guest')).toBeTruthy();
    await expand();
    expect(
      screen.getByText('No email or phone on file — add contact details to message this guest.'),
    ).toBeTruthy();
    expect(screen.queryByText('Send message')).toBeNull();
  });

  it('messages the address on the booking when there is no guest row', async () => {
    // The web falls back to `bookings.guest_email` (send-custom-booking-message
    // ~159-162), so a booking taken without a profile is still reachable.
    await render(
      <MessageGuestSection
        booking={makeBooking({ guest: null, guest_id: '', guest_email: 'walkup@example.com' })}
      />,
    );

    expect(screen.getByText('SMS / Email guest')).toBeTruthy();
    await expand();
    expect(screen.getByPlaceholderText('Write a message to the guest…')).toBeTruthy();
    expect(screen.getByText('Send message')).toBeTruthy();
  });

  it('sends { message, channel } via the mutation, on the web default channel', async () => {
    await render(<MessageGuestSection booking={makeBooking()} />);
    await expand();

    // All three options are offered, whatever the guest has on file (web
    // `GuestMessageChannelSelect`), and "both" is the one selected.
    expect(screen.getByText('Email & SMS (if available)')).toBeTruthy();
    expect(screen.getByText('SMS only')).toBeTruthy();

    await changeText(screen.getByPlaceholderText('Write a message to the guest…'), 'Running late?');
    await press(screen.getByText('Send message'));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toEqual({ message: 'Running late?', channel: 'both' });
  });

  it('names the failed channel when the send is rejected with a 502', async () => {
    mockMutate.mockImplementation((_input, opts) => {
      opts?.onError?.(
        new ApiError('Request failed (502)', 502, {
          success: false,
          errors: ['Email: Delivery failed (check provider configuration)'],
        }),
      );
    });
    await render(<MessageGuestSection booking={makeBooking()} />);
    await expand();

    await changeText(screen.getByPlaceholderText('Write a message to the guest…'), 'Hi');
    await press(screen.getByText('Send message'));

    expect(screen.getByText('Email: Delivery failed (check provider configuration)')).toBeTruthy();
  });

  it('surfaces a partial send (200 with errors[]) as "Partially sent …"', async () => {
    mockMutate.mockImplementation((_input, opts) => {
      opts?.onSuccess?.({ success: true, errors: ['SMS: Guest has no phone on file'] });
    });
    await render(<MessageGuestSection booking={makeBooking()} />);
    await expand();

    await changeText(screen.getByPlaceholderText('Write a message to the guest…'), 'Hi');
    await press(screen.getByText('Send message'));

    expect(
      screen.getByText('Partially sent — SMS: Guest has no phone on file'),
    ).toBeTruthy();
  });

  it('renders the log with the web label + recipient, and hides the error on a non-failed row', async () => {
    await render(
      <MessageGuestSection
        booking={makeBooking({
          communications: [
            {
              id: 'c1',
              message_type: 'custom_message',
              channel: 'email',
              status: 'sent',
              created_at: '2026-06-26T10:00:00.000Z',
              recipient: 'ada@example.com',
              // A stale error on a SENT row must not surface (web parity).
              error_message: 'stale error',
            },
          ],
        })}
      />,
    );
    await expand();
    expect(screen.getByText('Custom message')).toBeTruthy();
    expect(screen.getByText('To ada@example.com')).toBeTruthy();
    expect(screen.queryByText('stale error')).toBeNull();
  });

  it('shows the row error when the row actually failed', async () => {
    await render(
      <MessageGuestSection
        booking={makeBooking({
          communications: [
            {
              id: 'c1',
              message_type: 'custom_message',
              channel: 'sms',
              status: 'failed',
              created_at: '2026-06-26T10:00:00.000Z',
              recipient: '+447700900123',
              error_message: 'Carrier rejected',
            },
          ],
        })}
      />,
    );
    await expand();
    expect(screen.getByText('Carrier rejected')).toBeTruthy();
  });
});
