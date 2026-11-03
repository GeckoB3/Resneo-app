/**
 * The review step re-checks with the server when a service is removed
 * (split-visit plan G22, web `showTimesAgainFor`).
 *
 * Removing a service re-lays the rest from the visit's start on the client. That
 * used to be the end of it: the review then offered a visit the server might not
 * take there. Now the server is asked; when the visit, as it now is, no longer
 * fits at its start, the flow goes back to the times for the services that are
 * left, and says why.
 *
 * The harness is the one `ServiceBookingFlow.duration.test.tsx` drives.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';

import { ServiceBookingFlow } from '@/components/booking-wizard/ServiceBookingFlow';

const catalog: AppointmentCatalogResponse = {
  practitioners: [
    {
      id: 'prac-1',
      name: 'Pat',
      services: [
        { id: 'svc-1', name: 'Cut', duration_minutes: 30, buffer_minutes: 0, price_pence: 2500, deposit_pence: null },
        { id: 'svc-2', name: 'Extra', duration_minutes: 20, buffer_minutes: 0, price_pence: 1500, deposit_pence: null },
      ],
    },
  ],
};

const mockValidateSlot = jest.fn();
jest.mock('@/lib/queries/useValidateAppointmentSlot', () => ({
  useValidateAppointmentSlot: () => ({ mutateAsync: mockValidateSlot, isPending: false }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

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
jest.mock('@/lib/queries/useBookingFormVenue', () => ({
  useBookingFormVenue: () => ({
    venueId: 'venue-1',
    timeZone: 'Europe/London',
    anyAvailableEnabled: false,
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
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

/** What the slot step was asked to find times for. */
const slotStepDurations: (number | null)[] = [];
/** The services the slot step was asked to find times for, in visit order. */
const slotStepServices: string[][] = [];
jest.mock('@/components/booking-wizard/TimeSlotStep', () => {
  const { Pressable: P, Text: T, View: V } = require('react-native');
  return {
    venueLocalTime: () => '09:00',
    TimeSlotStep: ({
      chain,
      onSelectSlot,
      onContinue,
      serviceId,
      practitionerId,
      durationMinutes,
    }: {
      chain?: { service_id: string }[] | null;
      onSelectSlot: (slot: unknown) => void;
      onContinue: () => void;
      serviceId: string;
      practitionerId: string;
      durationMinutes: number | null;
    }) => {
      slotStepDurations.push(durationMinutes);
      slotStepServices.push(chain ? chain.map((c) => c.service_id) : [serviceId]);
      return (
        <V>
          <P
            accessibilityRole="button"
            onPress={() =>
              onSelectSlot({
                practitioner_id: practitionerId,
                practitioner_name: 'Pat',
                service_id: serviceId,
                service_name: 'Cut',
                start_time: '09:00:00',
                // The slot the server offered, at the OVERRIDDEN length.
                duration_minutes: durationMinutes ?? 30,
                price_pence: 2500,
              })
            }>
            <T>__pick_slot__</T>
          </P>
          <P accessibilityRole="button" onPress={() => onContinue()}>
            <T>__time_continue__</T>
          </P>
        </V>
      );
    },
  };
});

/** Guest step stub: the real one validates fields we do not care about here. */
jest.mock('@/components/booking-wizard/GuestDetailsStep', () => {
  const { Pressable: P, Text: T } = require('react-native');
  return {
    GuestDetailsStep: ({ onContinue }: { onContinue: () => void }) => (
      <P accessibilityRole="button" onPress={() => onContinue()}>
        <T>__guest_continue__</T>
      </P>
    ),
  };
});

/** Records the duration the final step would book at. */
const confirmProps: { durationOverride: number | null; segments: unknown }[] = [];
jest.mock('@/components/booking-wizard/ConfirmStep', () => {
  const { Text: T } = require('react-native');
  return {
    ConfirmStep: (props: { durationOverride: number | null; multiServiceSegments: unknown }) => {
      confirmProps.push({
        durationOverride: props.durationOverride,
        segments: props.multiServiceSegments,
      });
      return <T>__confirm__</T>;
    },
  };
});

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderFlow() {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <ServiceBookingFlow onCreated={jest.fn()} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  slotStepDurations.length = 0;
  slotStepServices.length = 0;
  confirmProps.length = 0;
  mockValidateSlot.mockReset();
  jest.useFakeTimers({
    doNotFake: [
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'setImmediate', 'clearImmediate', 'queueMicrotask', 'nextTick',
      'requestAnimationFrame', 'cancelAnimationFrame', 'hrtime', 'performance',
    ],
  });
  jest.setSystemTime(new Date('2026-06-15T09:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

/** Tick Cut and Extra, pick 09:00, and land on the review step. */
async function reviewTwoServices() {
  await act(async () => {
    renderFlow();
  });
  await waitFor(() => expect(screen.getByText('Cut')).toBeTruthy());
  await press(() => screen.getByText('Cut'));
  await press(() => screen.getByText('Extra'));
  await press(() => screen.getByText('Continue'));
  await press(() => screen.getByText('Continue'));
  await press(() => screen.getByText('__pick_slot__'));
  await press(() => screen.getByText('__time_continue__'));
  await waitFor(() => expect(screen.getByText('Review the services')).toBeTruthy());
}

describe('ServiceBookingFlow: removing a service on the review step (G22)', () => {
  it('asks the server about the visit as it now is, from its start', async () => {
    mockValidateSlot.mockResolvedValue({ ok: true, warnings: [] });
    await reviewTwoServices();

    await press(() => screen.getByLabelText('Remove Cut'));

    await waitFor(() => expect(mockValidateSlot).toHaveBeenCalledTimes(1));
    expect(mockValidateSlot).toHaveBeenCalledWith(
      expect.objectContaining({ service_id: 'svc-2', start_time: '09:00', staff: true }),
    );
    expect(mockValidateSlot.mock.calls[0][0]).not.toHaveProperty('override_availability');
    // It fits: the review stays, with Extra now first, at the visit's start.
    expect(screen.getByText('Review the services')).toBeTruthy();
    expect(screen.queryByLabelText('Remove Cut')).toBeNull();
  });

  it('shows the times again for the services left when they no longer fit', async () => {
    mockValidateSlot.mockResolvedValue({ ok: false, error: 'Outside working hours' });
    await reviewTwoServices();
    const timesAskedBefore = slotStepServices.length;

    await press(() => screen.getByLabelText('Remove Cut'));

    await waitFor(() =>
      expect(
        screen.getByText('These services no longer fit at 09:00. Choose another time below.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('Review the services')).toBeNull();
    // The times are asked for what is left (Extra alone), not the visit as it was.
    expect(slotStepServices.slice(timesAskedBefore).at(-1)).toEqual(['svc-2']);
  });

  it('keeps the review as it was when the check cannot be made', async () => {
    mockValidateSlot.mockRejectedValue(new Error('Network request failed'));
    await reviewTwoServices();

    await press(() => screen.getByLabelText('Remove Extra'));

    await waitFor(() => expect(screen.getByText('Could not check this change. Try again.')).toBeTruthy());
    expect(screen.getByLabelText('Remove Extra')).toBeTruthy();
  });
});
