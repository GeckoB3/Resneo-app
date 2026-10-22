/**
 * Event ticket holders with the A2 switches (web roles plan §5.6): a ticket holder's phone and email
 * read "Hidden" for someone whose "Can see client phone numbers and emails" is off, and the attendee
 * CSV is offered only with "Can export client data".
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));
jest.mock('@/lib/reports/csv-export', () => ({ buildAndShareCsv: jest.fn() }));

let mockRows: unknown[] = [];
jest.mock('@/lib/queries/useExperienceEvents', () => ({
  useEventAttendees: () => ({ data: mockRows, isLoading: false, isError: false, refetch: jest.fn() }),
  useToggleAttendeeArrived: () => ({ mutate: jest.fn(), isPending: false, variables: undefined }),
}));

import { EventAttendees } from '@/components/events/EventAttendees';
import type { ViewerAccess } from '@/lib/roles/roles';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';

const row = {
  booking_id: 'b1',
  status: 'Booked',
  party_size: 2,
  deposit_amount_pence: null,
  deposit_status: null,
  booking_date: '2030-01-10',
  booking_time: '19:00',
  client_arrived_at: null,
  guest_name: 'Ada Lovelace',
  ticket_lines: [],
};

async function renderAs(access: ViewerAccess) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ViewerAccessProvider value={access}>{children}</ViewerAccessProvider>
  );
  await render(<EventAttendees eventId="e1" onOpenBooking={jest.fn()} />, { wrapper });
}

describe('event ticket holders', () => {
  it('read "Hidden" in place of contacts, with no CSV without the export switch', async () => {
    mockRows = [{ ...row, guest_email: null, guest_phone: null }];
    await renderAs({ canSeeClientContact: false, canExportClients: false, otherDiaries: 'book' });
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.queryByLabelText('Export attendees as CSV')).toBeNull();
  });

  it('show contacts and the CSV to someone allowed both', async () => {
    mockRows = [{ ...row, guest_email: 'ada@example.com', guest_phone: null }];
    await renderAs({ canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' });
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByLabelText('Export attendees as CSV')).toBeTruthy();
  });
});
