/**
 * BookingRow deposit-pill render test (Domain 03).
 *
 * Web parity: the trailing deposit pill shows the amount alongside the status
 * ("£20.00 · Paid") when a `deposit_amount_pence` is known, falling back to the
 * bare status otherwise. A Pending + positive amount still shows the dedicated
 * "Deposit due" affordance instead.
 *
 * BookingRow's only context is `useTheme()` (reads `useColorScheme`, no
 * provider), so no wrapper is needed — mirrors StatusPill.test.tsx. RNTL 14's
 * `render()` is async, so each case awaits it.
 */
import { render, screen } from '@testing-library/react-native';

import { BookingRow } from '@/components/bookings/BookingRow';
import { formatPence } from '@/lib/format';
import type { BookingListRow } from '@/types/booking-list';

function bk(overrides: Partial<BookingListRow> & { id: string }): BookingListRow {
  return {
    booking_date: '2026-06-18',
    booking_time: '09:00',
    party_size: 1,
    status: 'Booked',
    guest_name: 'Ada Lovelace',
    deposit_status: null,
    ...overrides,
  };
}

describe('BookingRow deposit pill', () => {
  it('shows the deposit amount with the status when an amount is present', async () => {
    await render(
      <BookingRow
        booking={bk({ id: 'a', status: 'Booked', deposit_status: 'Paid', deposit_amount_pence: 2000 })}
        isAppointment
        onPress={() => {}}
      />,
    );
    const amount = formatPence(2000)!; // "£20.00"
    expect(screen.getByText(`${amount} · Paid`)).toBeTruthy();
  });

  it('falls back to the bare status when there is no amount', async () => {
    await render(
      <BookingRow
        booking={bk({ id: 'b', status: 'Booked', deposit_status: 'Refunded', deposit_amount_pence: null })}
        isAppointment
        onPress={() => {}}
      />,
    );
    expect(screen.getByText('Refunded')).toBeTruthy();
  });

  it('shows the "Deposit due" affordance for a Pending positive deposit (not the amount pill)', async () => {
    await render(
      <BookingRow
        booking={bk({ id: 'c', status: 'Booked', deposit_status: 'Pending', deposit_amount_pence: 1500 })}
        isAppointment
        onPress={() => {}}
      />,
    );
    expect(screen.getByText('Deposit due')).toBeTruthy();
    // The amount-with-status pill is suppressed in the Pending-due branch.
    const amount = formatPence(1500)!;
    expect(screen.queryByText(`${amount} · Pending`)).toBeNull();
  });

  it('renders no deposit text for hidden statuses like "Not Required"', async () => {
    await render(
      <BookingRow
        booking={bk({ id: 'd', status: 'Booked', deposit_status: 'Not Required', deposit_amount_pence: null })}
        isAppointment
        onPress={() => {}}
      />,
    );
    expect(screen.queryByText('Not Required')).toBeNull();
  });
});
