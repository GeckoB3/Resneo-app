import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockMutate = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('@/lib/queries/useCreateGroupBooking', () => ({
  useCreateGroupBooking: () => ({ mutate: mockMutate, isPending: false }),
}));
jest.mock('@/lib/queries/useMonthAvailability', () => ({
  useMonthAvailability: () => ({ data: { available_dates: [] }, isLoading: false, isFetching: false }),
}));
jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: () => ({ data: { guests: [] }, isFetching: false }),
}));
jest.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: { createBookingCompleted: 'x' },
  track: jest.fn(),
}));
// The flow announces unmet compliance requirements on the way to the booking
// (it has no confirmation screen of its own), so it needs the toast host.
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

import { GroupBookingFlow } from '@/components/booking-wizard/GroupBookingFlow';
import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

const catalog: AppointmentCatalogResponse = {
  practitioners: [
    {
      id: 'prac-1',
      name: 'Pat',
      services: [
        { id: 'svc-1', name: 'Massage', duration_minutes: 30, buffer_minutes: 0, price_pence: 3000, deposit_pence: null },
      ],
    },
  ],
};

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderFlow(overrides: Partial<React.ComponentProps<typeof GroupBookingFlow>> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <GroupBookingFlow
        catalog={catalog}
        venueId="venue-1"
        timeZone="Europe/London"
        anyAvailableEnabled={false}
        source="phone"
        onCreated={jest.fn()}
        onExitGroup={jest.fn()}
        {...overrides}
      />
    </SafeAreaProvider>,
  );
}

describe('GroupBookingFlow', () => {
  beforeEach(() => mockMutate.mockReset());

  it('starts on the empty group review with the create disabled', async () => {
    await renderFlow();
    expect(screen.getByText('Group booking')).toBeTruthy();
    expect(screen.getByText('No attendees yet. Add the first person to get started.')).toBeTruthy();
  });

  it('advances review → label → service when adding the first person', async () => {
    await renderFlow();
    await press(() => screen.getByText('+ Add the first person'));
    // Label step.
    expect(screen.getByText('Who is this for?')).toBeTruthy();
    await press(() => screen.getByText('Choose a service'));
    // Service step renders the catalog service.
    expect(screen.getByText('Massage')).toBeTruthy();
  });

  it('can switch back to the single-booking flow', async () => {
    const onExitGroup = jest.fn();
    await renderFlow({ onExitGroup });
    await press(() => screen.getByText('Switch to single booking'));
    expect(onExitGroup).toHaveBeenCalledTimes(1);
  });
});
