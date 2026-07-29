/**
 * The booking's payment ledger on screen. Before this existed the only view of
 * it was the admin-only refund list, three taps deep inside Take payment, so
 * end-of-day reconciliation had nothing to work from and a failed or still
 * processing card attempt was invisible everywhere.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { BookingPaymentHistory } from '@/components/bookings/BookingPaymentHistory';
import { buildPaymentHistory } from '@/lib/payments/payment-display';
import type { BookingPaymentRow } from '@/types/booking-detail';

const row = (over: Partial<BookingPaymentRow>): BookingPaymentRow => ({
  id: 'p1',
  booking_id: 'bk-1',
  method: 'card_present',
  status: 'succeeded',
  amount_pence: 2500,
  note: null,
  created_at: '2026-07-23T10:00:00Z',
  ...over,
});

function renderHistory(rows: BookingPaymentRow[]) {
  return render(<BookingPaymentHistory rows={buildPaymentHistory(rows, 'bk-1')} />);
}

describe('BookingPaymentHistory', () => {
  it('renders nothing when the booking has no ledger rows', async () => {
    await renderHistory([]);
    expect(screen.queryByText('Payment history')).toBeNull();
  });

  it('shows amount, method, status and date for each row', async () => {
    await renderHistory([row({})]);
    expect(screen.getByText('£25.00 · Card')).toBeTruthy();
    expect(screen.getByText('Collected')).toBeTruthy();
    expect(screen.getByText('23 Jul, 11:00')).toBeTruthy();
  });

  it('surfaces the rows staff most need: still processing, and failed', async () => {
    // A pending card row is the app's only warning that money is already in
    // flight; a failed one is the only trace of an attempt that went wrong.
    await renderHistory([
      row({ id: 'a', status: 'pending', created_at: '2026-07-23T11:00:00Z' }),
      row({ id: 'b', status: 'failed', amount_pence: 1000 }),
    ]);
    expect(screen.getByText('Processing')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it("labels a row collected on another service of the visit (§5.7)", async () => {
    await renderHistory([row({ booking_id: 'bk-2' })]);
    expect(screen.getByText('Collected on another service in this visit')).toBeTruthy();
  });

  it('collapses a long ledger, and expands on request', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row({ id: `p${i}`, created_at: `2026-07-2${i + 1}T10:00:00Z`, amount_pence: 100 * (i + 1) }),
    );
    await renderHistory(rows);

    expect(screen.queryByText('£1.00 · Card')).toBeNull(); // oldest, hidden
    await act(async () => {
      fireEvent.press(screen.getByText('Show 2 more'));
    });
    expect(screen.getByText('£1.00 · Card')).toBeTruthy();
    expect(screen.queryByText('Show 2 more')).toBeNull();
  });
});
