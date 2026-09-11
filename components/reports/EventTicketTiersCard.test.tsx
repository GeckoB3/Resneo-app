import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

jest.mock('@/lib/reports/csv-export', () => ({
  buildAndShareCsv: jest.fn(async () => ({ ok: true })),
}));

import { EventTicketTiersCard } from '@/components/reports/EventTicketTiersCard';
import { buildAndShareCsv } from '@/lib/reports/csv-export';

const RANGE = { from: '2026-09-01', to: '2026-09-30' };

const ROWS = [
  {
    ticket_type_key: 'tt1',
    ticket_type_label: 'Early bird',
    tickets_sold: 12,
    revenue_pence: 24000,
    booking_count: 8,
  },
  {
    ticket_type_key: 'tt2',
    ticket_type_label: 'Standard',
    tickets_sold: 5,
    revenue_pence: 12500,
    booking_count: 4,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
});

/** Event ticket sales by tier (web `ReportsView.tsx:1232-1287`). */
describe('EventTicketTiersCard', () => {
  it('totals the tickets, the revenue and the tiers, and lists each tier', async () => {
    await render(<EventTicketTiersCard rows={ROWS} range={RANGE} bookingWord="Booking" />);
    // The tile and the table column share the label.
    expect(screen.getAllByText('Tickets sold')).toHaveLength(2);
    expect(screen.getByText('17')).toBeTruthy();
    expect(screen.getByText(/365\.00/)).toBeTruthy();
    expect(screen.getByText('Ticket tiers sold')).toBeTruthy();
    expect(screen.getByText('Early bird')).toBeTruthy();
    // The bookings column carries the venue's word.
    expect(screen.getByText('Bookings')).toBeTruthy();
  });

  it('exports the web CSV', async () => {
    await render(<EventTicketTiersCard rows={ROWS} range={RANGE} bookingWord="Booking" />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Export Event ticket sales by tier as CSV'));
    });
    expect(buildAndShareCsv).toHaveBeenCalledWith(
      'report-event-ticket-tiers-2026-09-01-2026-09-30.csv',
      [
        ['Ticket type', 'Tickets sold', 'Bookings', 'Revenue (£)'],
        ['Early bird', '12', '8', '240.00'],
        ['Standard', '5', '4', '125.00'],
      ],
    );
  });
});
