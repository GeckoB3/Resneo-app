/**
 * The class roster with the A2 switches (web roles plan §5.6; web ClassInstanceDetailSheet): an
 * attendee's phone and email read "Hidden" for someone whose "Can see client phone numbers and
 * emails" is off, and the roster CSV is offered only with "Can export client data".
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => ({ Sheet: () => null }));
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: { current_user_role: 'staff', currency: 'GBP' } }),
}));
jest.mock('@/lib/reports/csv-export', () => ({ buildAndShareCsv: jest.fn() }));

let mockAttendees: unknown = null;
jest.mock('@/lib/queries/useClassesManage', () => ({
  useClassInstanceAttendees: () => ({
    data: mockAttendees,
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useCheckInAttendee: () => ({ mutate: jest.fn(), isPending: false }),
  useNoShowAttendee: () => ({ mutate: jest.fn(), isPending: false }),
  useCheckInAll: () => ({ mutate: jest.fn(), isPending: false }),
  useCancelClassInstance: () => ({ mutate: jest.fn(), isPending: false }),
}));

import { ClassRosterView } from '@/components/classes/ClassRosterView';
import type { ViewerAccess } from '@/lib/roles/roles';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';

const session = {
  classInstanceId: 'ci1',
  date: '2030-01-10',
  startTime: '10:00',
  endTime: '11:00',
  name: 'Yoga',
  accentColour: null,
  calendarId: null,
  capacity: 10,
  bookedSpots: 1,
};

const attendee = {
  booking_id: 'b1',
  status: 'Booked',
  party_size: 1,
  guest_name: 'Ada Lovelace',
};

async function renderAs(access: ViewerAccess) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ViewerAccessProvider value={access}>{children}</ViewerAccessProvider>
  );
  await render(<ClassRosterView session={session} onBack={jest.fn()} onOpenBooking={jest.fn()} />, { wrapper });
}

describe('the class roster', () => {
  it('reads "Hidden" in place of contacts, and has no CSV without the export switch', async () => {
    mockAttendees = {
      class_instance_id: 'ci1',
      contacts_hidden: true,
      attendees: [{ ...attendee, guest_phone: null, guest_email: null }],
    };
    await renderAs({ canSeeClientContact: false, canExportClients: false, otherDiaries: 'view' });
    expect(screen.getByText('1 spot · Hidden')).toBeTruthy();
    expect(screen.queryByLabelText('Export roster as CSV')).toBeNull();
  });

  it('shows contacts and the CSV to someone allowed both', async () => {
    mockAttendees = {
      class_instance_id: 'ci1',
      attendees: [{ ...attendee, guest_phone: null, guest_email: 'ada@example.com' }],
    };
    await renderAs({ canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' });
    expect(screen.getByText('1 spot · ada@example.com')).toBeTruthy();
    expect(screen.getByLabelText('Export roster as CSV')).toBeTruthy();
  });
});
