/**
 * Staff custom duration, end to end through the single-service flow.
 *
 * Reported from a device: choosing a custom duration next to a service is
 * ignored and the booking is made at the service's default length. The service
 * step itself is proven correct by `ServicePickerStep.duration.test.tsx`, so
 * this drives the whole wizard and records what each later step actually
 * receives — the chain segment and the confirm step.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';

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
jest.mock('@/components/booking-wizard/TimeSlotStep', () => {
  const { Pressable: P, Text: T, View: V } = require('react-native');
  return {
    venueLocalTime: () => '09:00',
    TimeSlotStep: ({
      onSelectSlot,
      onContinue,
      serviceId,
      practitionerId,
      durationMinutes,
    }: {
      onSelectSlot: (slot: unknown) => void;
      onContinue: () => void;
      serviceId: string;
      practitionerId: string;
      durationMinutes: number | null;
    }) => {
      slotStepDurations.push(durationMinutes);
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

/** Guest step stub — the real one validates fields we do not care about here. */
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

function renderFlow() {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <ServiceBookingFlow onCreated={jest.fn()} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  slotStepDurations.length = 0;
  confirmProps.length = 0;
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

/** Service step → custom duration → date → time → review → guest → confirm. */
async function bookWithCustomDuration() {
  await act(async () => {
    renderFlow();
  });

  await waitFor(() => expect(screen.getByText('Cut')).toBeTruthy());
  await press(() => screen.getByLabelText('Duration, 30 minutes'));
  await press(() => screen.getByText('90m'));
  await press(() => screen.getByText('Done'));
  await press(() => screen.getByText('Cut'));

  await press(() => screen.getByText('Continue'));
  await press(() => screen.getByText('__pick_slot__'));
  await press(() => screen.getByText('__time_continue__'));

  await waitFor(() => expect(screen.getByText('Review your services')).toBeTruthy());
  await press(() => screen.getByText('Continue to details'));
  await press(() => screen.getByText('__guest_continue__'));
  await waitFor(() => expect(screen.getByText('__confirm__')).toBeTruthy());
}

describe('ServiceBookingFlow — staff custom duration', () => {
  it('looks for slots at the chosen duration, not the default', async () => {
    await bookWithCustomDuration();
    expect(slotStepDurations.filter((d) => d != null)).toContain(90);
    expect(slotStepDurations).not.toContain(30);
  });

  it('books at the chosen duration', async () => {
    await bookWithCustomDuration();

    const last = confirmProps[confirmProps.length - 1]!;
    // A single service must NOT be sent as a chain: `create-multi-service` has
    // no per-service duration field, so the override would be dropped.
    expect(last.segments).toBeNull();
    expect(last.durationOverride).toBe(90);
  });
});

describe('ServiceBookingFlow — what the review step shows', () => {
  it('shows the chosen duration on the review step, not the natural one', async () => {
    await act(async () => {
      renderFlow();
    });

    await waitFor(() => expect(screen.getByText('Cut')).toBeTruthy());
    await press(() => screen.getByLabelText('Duration, 30 minutes'));
    await press(() => screen.getByText('90m'));
    await press(() => screen.getByText('Done'));
    await press(() => screen.getByText('Cut'));
    await press(() => screen.getByText('Continue'));
    await press(() => screen.getByText('__pick_slot__'));
    await press(() => screen.getByText('__time_continue__'));

    await waitFor(() => expect(screen.getByText('Review your services')).toBeTruthy());
    // 09:00 + 90 min = 10:30. The natural 30 min would read 9:00am–9:30am.
    expect(screen.getByText(/9:00am–10:30am/)).toBeTruthy();
  });
});

/**
 * A custom duration now survives into a chain: `create-multi-service` takes a
 * per-segment `duration_minutes` (web 2026-09-02) and the payload sends it, so
 * the second service chains from the stretched end rather than the catalogue
 * one. (Before that the append path reset segment 1 to 30 min.)
 */
describe('ServiceBookingFlow — appending a second service', () => {
  it('keeps the custom duration and chains the next service from its end', async () => {
    await act(async () => {
      renderFlow();
    });

    await waitFor(() => expect(screen.getByText('Cut')).toBeTruthy());
    await press(() => screen.getByLabelText('Duration, 30 minutes'));
    await press(() => screen.getByText('90m'));
    await press(() => screen.getByText('Done'));
    await press(() => screen.getByText('Cut'));
    await press(() => screen.getByText('Continue'));
    await press(() => screen.getByText('__pick_slot__'));
    await press(() => screen.getByText('__time_continue__'));

    await waitFor(() => expect(screen.getByText(/9:00am–10:30am/)).toBeTruthy());

    await press(() => screen.getByText('+ Add another service'));
    await press(() => screen.getAllByText('Extra')[0]!);

    // Segment 1 keeps its 90 min, so segment 2 chains from 10:30.
    await waitFor(() => expect(screen.getByText(/10:30am–10:50am/)).toBeTruthy());
    expect(screen.getByText(/9:00am–10:30am/)).toBeTruthy();
  });
});
