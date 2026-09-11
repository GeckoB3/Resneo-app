import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

jest.mock('@/lib/reports/csv-export', () => ({
  buildAndShareCsv: jest.fn(async () => ({ ok: true })),
}));

import {
  ResourceUtilisationCard,
  TableUtilisationCard,
} from '@/components/reports/UtilisationCards';
import { buildAndShareCsv } from '@/lib/reports/csv-export';

const RANGE = { from: '2026-09-01', to: '2026-09-30' };

beforeEach(() => {
  jest.clearAllMocks();
});

/** Table + resource utilisation (web `ReportsView.tsx:1190-1329`). */
describe('TableUtilisationCard', () => {
  it('lists each table with its percentage and the hours behind it', async () => {
    await render(
      <TableUtilisationCard
        rows={[
          {
            table_id: 't1',
            table_name: 'Window 4',
            utilisation_pct: 62,
            occupied_hours: 7.5,
            available_hours: 12,
          },
        ]}
        range={RANGE}
      />,
    );
    expect(screen.getByText('Window 4')).toBeTruthy();
    expect(screen.getByText('62%')).toBeTruthy();
    expect(screen.getByText('7.5h occupied / 12h available')).toBeTruthy();
  });

  it('exports the web CSV', async () => {
    await render(
      <TableUtilisationCard
        rows={[
          {
            table_id: 't1',
            table_name: 'Window 4',
            utilisation_pct: 62,
            occupied_hours: 7.5,
            available_hours: 12,
          },
        ]}
        range={RANGE}
      />,
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Export Table utilisation as CSV'));
    });
    expect(buildAndShareCsv).toHaveBeenCalledWith(
      'report5-table-utilisation-2026-09-01-2026-09-30.csv',
      [
        ['Table', 'Utilisation %', 'Occupied hours', 'Available hours'],
        ['Window 4', '62', '7.5', '12'],
      ],
    );
  });

  it('says so when the range has no table data, and blocks the export', async () => {
    await render(<TableUtilisationCard rows={[]} range={RANGE} />);
    expect(screen.getByText('No table utilisation data for this range.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Export Table utilisation as CSV'));
    });
    expect(buildAndShareCsv).not.toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledWith(
      'There is no table utilisation data to export for this period.',
    );
  });
});

describe('ResourceUtilisationCard', () => {
  const rows = [
    {
      resource_id: 'r1',
      resource_name: 'Studio A',
      booking_count: 5,
      occupied_hours: 6,
      available_hours: 40,
      utilisation_pct: 15,
    },
  ];

  it('shows the bookings and hours caption the web shows', async () => {
    await render(<ResourceUtilisationCard rows={rows} range={RANGE} />);
    expect(screen.getByText('Studio A')).toBeTruthy();
    expect(screen.getByText('15%')).toBeTruthy();
    expect(screen.getByText('5 bookings · 6h booked / 40h open')).toBeTruthy();
    expect(screen.getByText(/Only active bookings \(not cancelled\) count toward booked hours\./)).toBeTruthy();
  });

  it('exports the web CSV', async () => {
    await render(<ResourceUtilisationCard rows={rows} range={RANGE} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Export Resource utilisation as CSV'));
    });
    expect(buildAndShareCsv).toHaveBeenCalledWith(
      'report-resource-utilisation-2026-09-01-2026-09-30.csv',
      [
        ['Resource', 'Bookings', 'Utilisation %', 'Booked hours', 'Available hours'],
        ['Studio A', '5', '15', '6', '40'],
      ],
    );
  });
});
