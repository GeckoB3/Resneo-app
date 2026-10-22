/**
 * The new-booking wizard and other people's diaries (web roles plan §5.11, §7.3). A View only or
 * Hidden person adds appointments only to their own calendars, so the form offers only those (the
 * server refuses the rest with DIARY_VIEW_ONLY; "Any available" already pools only theirs). With
 * no calendar of their own the form says so instead of offering services. Everyone on "Can book
 * and change" sees every calendar, as before. The setup is the staff-first suite's.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';

import { ServiceBookingFlow } from '@/components/booking-wizard/ServiceBookingFlow';
import type { ViewerAccess } from '@/lib/roles/roles';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';

// Two practitioners with DIFFERENT catalogues, so scoping is observable: Sam
// offers only Cut, Pat offers Cut and Blow-dry. Cut is offered by both, which is
// what makes the service-first flow show a practitioner step.
const catalog: AppointmentCatalogResponse = {
  practitioners: [
    {
      id: 'prac-1',
      name: 'Pat',
      services: [
        { id: 'svc-1', name: 'Cut', duration_minutes: 30, buffer_minutes: 0, price_pence: 2500, deposit_pence: null },
        { id: 'svc-2', name: 'Blow-dry', duration_minutes: 20, buffer_minutes: 0, price_pence: 1500, deposit_pence: null },
      ],
    },
    {
      id: 'prac-2',
      name: 'Sam',
      services: [
        { id: 'svc-1', name: 'Cut', duration_minutes: 45, buffer_minutes: 0, price_pence: 3000, deposit_pence: null },
      ],
    },
  ],
};

jest.mock('@/lib/queries/useValidateAppointmentSlot', () => ({
  useValidateAppointmentSlot: () => ({
    mutateAsync: jest.fn().mockResolvedValue({ ok: true, warnings: [] }),
    isPending: false,
  }),
}));
jest.mock('@/lib/queries/useAppointmentCatalog', () => ({
  useAppointmentCatalog: () => ({
    data: catalog,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/lib/queries/useServicesManage', () => ({
  useManagedServices: () => ({ data: { services: [] }, isLoading: false }),
}));
jest.mock('@/lib/queries/useMonthAvailability', () => ({
  useMonthAvailability: () => ({
    data: { available_dates: ['2026-06-20'] },
    isLoading: false,
    isFetching: false,
  }),
}));
jest.mock('@/lib/queries/useGuestDetail', () => ({ useGuestDetail: () => ({ data: null }) }));
jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: () => ({ data: { guests: [] }, isFetching: false }),
}));

let mockStaffFirstEnabled = true;
let mockAnyAvailableEnabled = false;
jest.mock('@/lib/queries/useBookingFormVenue', () => ({
  useBookingFormVenue: () => ({
    venueId: 'venue-1',
    timeZone: 'Europe/London',
    anyAvailableEnabled: mockAnyAvailableEnabled,
    staffFirstEnabled: mockStaffFirstEnabled,
    isLinked: false,
  }),
}));
jest.mock('@/providers/LinkedVenueProvider', () => ({
  useLinkedVenueContext: () => ({ ownerVenueId: null }),
}));
jest.mock('@/lib/rebook-bootstrap', () => ({
  readAndClearRebookBootstrap: jest.fn().mockResolvedValue(null),
  resetRebookBootstrapGuard: jest.fn(),
}));
jest.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: { createBookingCompleted: 'x' },
  track: jest.fn(),
}));

let mockSearchParams: Record<string, string> = {};
// Unlike the sibling suite, this one RENDERS the header's left control: the back
// button is how you leave a reordered step, so it has to be pressable here.
jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options?: { headerLeft?: () => React.ReactNode } }) =>
      typeof options?.headerLeft === 'function' ? options.headerLeft() : null,
  },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('@/components/booking-wizard/TimeSlotStep', () => {
  const { Text: T, View: V } = require('react-native');
  return { venueLocalTime: () => '09:00', TimeSlotStep: () => <V><T>__time_step__</T></V> };
});
jest.mock('@/components/booking-wizard/ConfirmStep', () => ({ ConfirmStep: () => null }));

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderFlow(access: ViewerAccess) {
  await act(async () => {
    render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <ViewerAccessProvider value={access}>
          <ServiceBookingFlow onCreated={jest.fn()} />
        </ViewerAccessProvider>
      </SafeAreaProvider>,
    );
  });
}

const viewOnly = (ownCalendarIds: string[]): ViewerAccess => ({
  canSeeClientContact: true,
  canExportClients: true,
  otherDiaries: 'view',
  ownCalendarIds,
});
const BOOK: ViewerAccess = { canSeeClientContact: true, canExportClients: true, otherDiaries: 'book' };

beforeEach(() => {
  mockStaffFirstEnabled = true;
  mockAnyAvailableEnabled = false;
  mockSearchParams = {};
  jest.useFakeTimers({
    doNotFake: [
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate',
      'clearImmediate', 'queueMicrotask', 'nextTick', 'requestAnimationFrame',
      'cancelAnimationFrame', 'hrtime', 'performance',
    ],
  });
  jest.setSystemTime(new Date('2026-06-15T09:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
});


describe("ServiceBookingFlow and other people's diaries", () => {
  it("lists only a View only person's own calendars", async () => {
    await renderFlow(viewOnly(['prac-2']));

    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.queryByText('Pat')).toBeNull();
  });

  it('offers only the services their own calendar does', async () => {
    mockStaffFirstEnabled = false;
    await renderFlow(viewOnly(['prac-2']));

    await waitFor(() => expect(screen.getByText('Cut')).toBeTruthy());
    expect(screen.queryByText('Blow-dry')).toBeNull();
  });

  it('says so when they have no calendar of their own', async () => {
    await renderFlow(viewOnly([]));

    expect(screen.getByText('No calendar of your own')).toBeTruthy();
    expect(
      screen.getByText(
        "You can only add bookings to your own calendar, and you don't have one yet. Ask an admin to give you one.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Who is it with?')).toBeNull();
  });

  it('lists every calendar for everyone on Can book and change', async () => {
    await renderFlow(BOOK);

    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
    expect(screen.getByText('Pat')).toBeTruthy();
    expect(screen.getByText('Sam')).toBeTruthy();
  });
});
