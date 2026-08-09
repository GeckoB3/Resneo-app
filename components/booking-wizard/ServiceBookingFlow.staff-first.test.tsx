/**
 * Staff-first ordering in the app's new-booking wizard (web parity, resneo#129).
 *
 * The venue toggle `staff_first_booking_flow` is NOT public-only: when it is on,
 * the staff-facing form asks who the booking is with first, then shows only that
 * person's services — the same reorder the public and collective pages get. With
 * it off, nothing changes.
 *
 * Entry-rule edge cases (calendar prefill, walk-ins, rebooks) are pinned in
 * `lib/booking/appointment-flow-order.test.ts`; this suite covers what the
 * component does with the answer.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';

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

import { ServiceBookingFlow } from '@/components/booking-wizard/ServiceBookingFlow';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderFlow() {
  await act(async () => {
    render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <ServiceBookingFlow onCreated={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
}

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

describe('ServiceBookingFlow — staff-first ordering', () => {
  it('asks who the booking is with before showing any service', async () => {
    await renderFlow();

    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
    expect(screen.queryByText('Choose a service')).toBeNull();
    // Both bookable people are listed.
    expect(screen.getByText('Pat')).toBeTruthy();
    expect(screen.getByText('Sam')).toBeTruthy();
  });

  it('scopes the service list to the person chosen', async () => {
    await renderFlow();

    await press(() => screen.getByText('Sam'));

    await waitFor(() => expect(screen.getByText('Choose a service')).toBeTruthy());
    // Sam offers Cut only; Pat's Blow-dry must not appear.
    expect(screen.getByText('Cut')).toBeTruthy();
    expect(screen.queryByText('Blow-dry')).toBeNull();
  });

  it('shows the other person a different catalogue', async () => {
    await renderFlow();

    await press(() => screen.getByText('Pat'));

    await waitFor(() => expect(screen.getByText('Choose a service')).toBeTruthy());
    expect(screen.getByText('Blow-dry')).toBeTruthy();
  });

  it('never asks for the practitioner again after the service', async () => {
    await renderFlow();

    // Cut is offered by BOTH people — in service-first that is exactly the case
    // that triggers the practitioner step. Staff-first has already answered it.
    await press(() => screen.getByText('Sam'));
    await waitFor(() => expect(screen.getByText('Cut')).toBeTruthy());
    await press(() => screen.getByText('Cut'));

    await waitFor(() => expect(screen.queryByText('Choose a service')).toBeNull());
    expect(screen.queryByText('Choose a practitioner')).toBeNull();
  });

  it('goes back from the service list to the person, not out of the form', async () => {
    await renderFlow();

    await press(() => screen.getByText('Sam'));
    await waitFor(() => expect(screen.getByText('Choose a service')).toBeTruthy());

    await press(() => screen.getByLabelText('Back'));

    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
  });

  it('drops a service chosen under the previous person when the person changes', async () => {
    await renderFlow();

    await press(() => screen.getByText('Pat'));
    await waitFor(() => expect(screen.getByText('Blow-dry')).toBeTruthy());
    await press(() => screen.getByText('Blow-dry'));
    // Blow-dry has no options, so that landed on the date step: back through the
    // service list, then back again to the person, and switch to someone who
    // does not offer it.
    await waitFor(() => expect(screen.queryByText('Choose a service')).toBeNull());
    await press(() => screen.getByLabelText('Back'));
    await waitFor(() => expect(screen.getByText('Choose a service')).toBeTruthy());
    await press(() => screen.getByLabelText('Back'));
    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
    await press(() => screen.getByText('Sam'));

    await waitFor(() => expect(screen.getByText('Choose a service')).toBeTruthy());
    expect(screen.queryByText('Blow-dry')).toBeNull();
  });

  it('offers the pooled option when the venue has "any available" on', async () => {
    mockAnyAvailableEnabled = true;
    await renderFlow();

    await waitFor(() => expect(screen.getByText('Any available')).toBeTruthy());
    // Pooled pick is not scoped to anyone, so the full catalogue shows.
    await press(() => screen.getByText('Any available'));
    await waitFor(() => expect(screen.getByText('Choose a service')).toBeTruthy());
    expect(screen.getByText('Cut')).toBeTruthy();
    expect(screen.getByText('Blow-dry')).toBeTruthy();
  });

  it('hides the pooled option when the venue has it off', async () => {
    await renderFlow();

    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
    expect(screen.queryByText('Any available')).toBeNull();
  });
});

describe('ServiceBookingFlow — toggle off keeps the old order', () => {
  it('opens on the service list, then asks for the practitioner', async () => {
    mockStaffFirstEnabled = false;
    await renderFlow();

    await waitFor(() => expect(screen.getByText('Choose a service')).toBeTruthy());
    expect(screen.queryByText('Who is it with?')).toBeNull();

    // Cut is offered by two people, so the practitioner step still follows it.
    await press(() => screen.getByText('Cut'));
    await waitFor(() => expect(screen.getByText('Choose a practitioner')).toBeTruthy());
  });
});

describe('ServiceBookingFlow — a calendar slot tap already knows who', () => {
  it('stays service-first when date, time and column all arrive', async () => {
    mockSearchParams = { date: '2026-06-20', time: '09:00', practitionerId: 'prac-2' };
    await renderFlow();

    await waitFor(() => expect(screen.getByText('Choose a service')).toBeTruthy());
    expect(screen.queryByText('Who is it with?')).toBeNull();
  });

  it('still reorders a walk-in launched from a column', async () => {
    mockSearchParams = {
      date: '2026-06-20',
      time: '09:00',
      practitionerId: 'prac-2',
      intent: 'walk-in',
    };
    await renderFlow();

    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
  });
});
