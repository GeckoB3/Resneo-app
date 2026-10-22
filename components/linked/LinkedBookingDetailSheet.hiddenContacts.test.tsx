/**
 * A partner's booking with hidden client contacts (web roles plan A2, §5.6, §6.4): the switch covers
 * a site's clients wherever they are seen, so on a link that shares client details the phone and
 * email read "Hidden" with the tip, and there is no call, text or email. Everyone else sees them.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/components/ui/ConfirmSheet', () => ({ ConfirmSheet: () => null }));
jest.mock('@/components/linked/LinkedComplianceSection', () => ({ LinkedComplianceSection: () => null }));
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));
jest.mock('@/lib/queries/useLinkedCalendar', () => ({
  pingLinkedBookingView: jest.fn(),
  useUpdateLinkedBooking: () => ({ mutate: jest.fn(), isPending: false }),
}));

import { LinkedBookingDetailSheet } from '@/components/linked/LinkedBookingDetailSheet';
import type { ViewerAccess } from '@/lib/roles/roles';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';
import type { LinkedBooking, LinkedVenueCalendar } from '@/types/linked-venues';

const TIP = 'Your business has hidden client phone numbers and emails for you.';

const venue = {
  venueId: 'v2',
  venueName: 'Partner',
  linkId: 'l1',
  visibility: 'full_details',
  action: 'none',
  pii: true,
  practitioners: [],
  services: [],
  resources: [],
  bookings: [],
} as unknown as LinkedVenueCalendar;

function booking(overrides: Partial<LinkedBooking> = {}): LinkedBooking {
  return {
    id: 'b1',
    bookingDate: '2030-01-10',
    bookingTime: '10:00',
    status: 'Booked',
    guestName: 'Ada Lovelace',
    guestId: 'g1',
    ...overrides,
  } as LinkedBooking;
}

async function renderAs(access: ViewerAccess, b: LinkedBooking) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ViewerAccessProvider value={access}>{children}</ViewerAccessProvider>
  );
  await render(<LinkedBookingDetailSheet venue={venue} booking={b} visible onClose={jest.fn()} />, { wrapper });
}

describe("a partner's booking", () => {
  it('reads "Hidden" with the tip, and offers no call, text or email', async () => {
    await renderAs(
      { canSeeClientContact: false, canExportClients: true, otherDiaries: 'book' },
      booking({ guestPhone: null, guestEmail: null }),
    );
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.getByText(TIP)).toBeTruthy();
    expect(screen.queryByText('Call')).toBeNull();
    expect(screen.queryByText('Text')).toBeNull();
  });

  it('shows the phone and email with actions to everyone else', async () => {
    await renderAs(
      { canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' },
      booking({ guestPhone: '+447700900123', guestEmail: 'ada@example.com' }),
    );
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByText('Call')).toBeTruthy();
    expect(screen.getByText('Text')).toBeTruthy();
  });
});
