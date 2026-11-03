/**
 * G4 on the Bookings tab: a multi-service visit is ONE card (web split-visit plan 6.8), showing
 * its span, "· 2 services" and each service with its person, and opening the visit at its
 * earliest service. A booking on its own is listed exactly as before.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { CustomerBooking, CustomerHome } from '@/lib/queries/useCustomerHome';

import CustomerBookingsScreen from './bookings';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: () => undefined }));
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('@/components/customer/WaitlistSection', () => ({ WaitlistSection: () => null }));

let mockRows: CustomerBooking[] = [];
jest.mock('@/lib/queries/useCustomerBookings', () => ({
  useCustomerBookings: () => ({ data: { bookings: mockRows }, isLoading: false, isError: false, refetch: jest.fn() }),
}));
const mockHome = { venues: [{ id: 'v-1', name: 'Studio' }] } as unknown as CustomerHome;
jest.mock('@/lib/queries/useCustomerHome', () => {
  const actual = jest.requireActual<typeof import('@/lib/queries/useCustomerHome')>('@/lib/queries/useCustomerHome');
  return { ...actual, useCustomerHome: () => ({ data: mockHome }) };
});

function row(id: string, overrides: Partial<CustomerBooking> = {}): CustomerBooking {
  return {
    id,
    venue_id: 'v-1',
    booking_date: '2099-11-27',
    booking_time: '10:00:00',
    booking_end_time: '10:30:00',
    status: 'Booked',
    booking_model: 'unified_scheduling',
    visit_key: null,
    visit_service_count: 1,
    service_name: null,
    person_name: null,
    ...overrides,
  };
}

async function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <CustomerBookingsScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockPush.mockReset();
  mockRows = [
    row('b-cut', {
      visit_key: 'visit-1',
      visit_service_count: 2,
      booking_time: '13:45:00',
      booking_end_time: '14:15:00',
      service_name: 'Cut',
      person_name: 'Steph',
    }),
    row('b-colour', {
      visit_key: 'visit-1',
      visit_service_count: 2,
      booking_time: '13:00:00',
      booking_end_time: '14:30:00',
      service_name: 'Colour',
      person_name: 'Aisha',
    }),
    row('b-single', { booking_date: '2099-12-01', booking_time: '09:00:00' }),
  ];
});

describe('the Bookings tab lists one card per visit', () => {
  it('shows the two services of a visit as one card, and a booking on its own as before', async () => {
    await renderTab();
    // Two cards in all: the visit and the single booking, each naming the venue once.
    expect(screen.getAllByText('Studio')).toHaveLength(2);
    expect(screen.getByText(/Friday 27 November, 13:00 to 14:30 · 2 services/)).toBeTruthy();
    expect(screen.getByText('13:00 Colour with Aisha')).toBeTruthy();
    expect(screen.getByText('13:45 Cut with Steph')).toBeTruthy();
    // The single booking keeps today's line.
    expect(screen.getByText('Tuesday 1 December at 09:00')).toBeTruthy();
  });

  it('opens the visit at its earliest service', async () => {
    await renderTab();
    await fireEvent.press(screen.getByText('13:00 Colour with Aisha'));
    expect(mockPush).toHaveBeenCalledWith('/booking/b-colour');
  });

  it('says the visit is cancelled only when every service is', async () => {
    mockRows = mockRows.map((r) => (r.id === 'b-colour' ? { ...r, status: 'Cancelled' } : r));
    await renderTab();
    expect(screen.queryByText('Cancelled')).toBeNull();
    expect(screen.getByText('13:00 Colour with Aisha (cancelled)')).toBeTruthy();

    mockRows = mockRows.map((r) => (r.visit_key ? { ...r, status: 'Cancelled' } : r));
    await renderTab();
    expect(screen.getByText('Cancelled')).toBeTruthy();
  });
});
