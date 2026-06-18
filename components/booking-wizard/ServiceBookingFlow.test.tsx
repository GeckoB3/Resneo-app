import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';

// ── Module mocks ──────────────────────────────────────────────────────────────
// Catalog: ONE service with a NON-ZERO buffer (the regressed case) offered by a
// single practitioner, so the flow skips the practitioner step and the service's
// buffer must survive into the seeded chain.
const catalog: AppointmentCatalogResponse = {
  practitioners: [
    {
      id: 'prac-1',
      name: 'Pat',
      services: [
        { id: 'svc-1', name: 'Cut', duration_minutes: 30, buffer_minutes: 15, price_pence: 2500, deposit_pence: null },
        { id: 'svc-2', name: 'Blow-dry', duration_minutes: 20, buffer_minutes: 0, price_pence: 1500, deposit_pence: null },
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
jest.mock('@/lib/queries/useGuestDetail', () => ({
  useGuestDetail: () => ({ data: null }),
}));
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
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// Stub the slot picker — it has its own tests and a live availability fetch; here
// we only need it to emit a concrete slot at a fixed time and continue, so the
// flow seeds the multi-service chain from the chosen service + slot.
jest.mock('@/components/booking-wizard/TimeSlotStep', () => {
  const { Pressable: P, Text: T, View: V } = require('react-native');
  // Two separate controls: selecting the slot sets state, and a distinct
  // "continue" press fires AFTER that state has flushed — so the parent's
  // seedMultiServiceChain reads the chosen slot (not a stale null).
  return {
    venueLocalTime: () => '09:00',
    TimeSlotStep: ({
      onSelectSlot,
      onContinue,
      serviceId,
      practitionerId,
    }: {
      onSelectSlot: (slot: unknown) => void;
      onContinue: () => void;
      serviceId: string;
      practitionerId: string;
    }) => (
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
              duration_minutes: 30,
              price_pence: 2500,
            })
          }>
          <T>__pick_slot__</T>
        </P>
        <P accessibilityRole="button" onPress={() => onContinue()}>
          <T>__time_continue__</T>
        </P>
      </V>
    ),
  };
});

// ConfirmStep is irrelevant to this test (we stop at the review); stub it to keep
// the render light and avoid its create-mutation hooks.
jest.mock('@/components/booking-wizard/ConfirmStep', () => ({
  ConfirmStep: () => null,
}));

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

describe('ServiceBookingFlow — multi-service buffer (regression)', () => {
  it("seeds the FIRST segment with the service's real buffer so segment-2 chains past it", async () => {
    await act(async () => {
      renderFlow();
    });

    // Pick the non-zero-buffer service (single practitioner → straight to date).
    await waitFor(() => expect(screen.getByText('Cut')).toBeTruthy());
    await press(() => screen.getByText('Cut'));
    // Date step: continue from the (auto-selected, available) date.
    await press(() => screen.getByText('Continue'));
    // Time step (stubbed): select a 09:00 slot, then continue → seeds the chain.
    await press(() => screen.getByText('__pick_slot__'));
    await press(() => screen.getByText('__time_continue__'));

    // Multi-service review: append the second service.
    await waitFor(() => expect(screen.getByText('Review your services')).toBeTruthy());
    await press(() => screen.getByText('+ Add another service'));
    await press(() => screen.getByText('Blow-dry'));

    // Segment 1: 09:00–09:30 (30 min). Segment 2 MUST start at 09:45, NOT 09:30 —
    // i.e. first start + 30 min duration + 15 min buffer. The old hardcoded
    // bufferMinutes: 0 would have produced 09:30 and the server would 400.
    await waitFor(() => expect(screen.getByText(/9:00am–9:30am/)).toBeTruthy());
    expect(screen.getByText(/9:45am–10:05am/)).toBeTruthy();
  });
});
