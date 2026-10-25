/**
 * The chosen client through the single-service flow (web roles plan A2, §5.6): "Book" from a
 * client's profile (`/booking/new?guestId=`) and a rebook that names the client both carry that
 * client's id to the create as `guest_id`, and "Book another" clears it.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';
import type { GuestDetails } from '@/components/booking-wizard/GuestDetailsStep';

import { ServiceBookingFlow } from '@/components/booking-wizard/ServiceBookingFlow';

let mockParams: Record<string, string> = {};

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

jest.mock('@/lib/queries/useValidateAppointmentSlot', () => ({
  useValidateAppointmentSlot: () => ({
    mutateAsync: jest.fn().mockResolvedValue({ ok: true, warnings: [] }),
    isPending: false,
  }),
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
jest.mock('@/lib/queries/useGuestDetail', () => ({
  useGuestDetail: (id: string | null) =>
    id ? { data: { guest: { id, first_name: 'Ana', last_name: 'Lopez', phone: null, email: null } } } : { data: null },
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
const mockRebook = jest.fn();
jest.mock('@/lib/rebook-bootstrap', () => ({
  readAndClearRebookBootstrap: () => mockRebook(),
  resetRebookBootstrapGuard: jest.fn(),
}));
jest.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: { createBookingCompleted: 'x' },
  track: jest.fn(),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

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

/** The guest step: shows which client it holds. */
const guestValues: GuestDetails[] = [];
jest.mock('@/components/booking-wizard/GuestDetailsStep', () => {
  const { Pressable: P, Text: T, View: V } = require('react-native');
  return {
    GuestDetailsStep: ({ value, onContinue }: { value: GuestDetails; onContinue: () => void }) => {
      guestValues.push(value);
      return (
        <V>
          <T>{`__guest_id:${value.guest_id ?? 'none'}__`}</T>
          <P accessibilityRole="button" onPress={() => onContinue()}>
            <T>__guest_continue__</T>
          </P>
        </V>
      );
    },
  };
});

/** The review step: records the guest it would book, and offers "Book another". */
const confirmGuests: GuestDetails[] = [];
jest.mock('@/components/booking-wizard/ConfirmStep', () => {
  const { Pressable: P, Text: T, View: V } = require('react-native');
  return {
    ConfirmStep: ({ guest, onBookAnother }: { guest: GuestDetails; onBookAnother?: () => void }) => {
      confirmGuests.push(guest);
      return (
        <V>
          <T>__confirm__</T>
          <P accessibilityRole="button" onPress={() => onBookAnother?.()}>
            <T>__book_another__</T>
          </P>
        </V>
      );
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

/** Service, date, time, review, then the guest step. */
async function walkToGuestStep() {
  await waitFor(() => expect(screen.getByText('Cut')).toBeTruthy());
  await press(() => screen.getByText('Cut'));
  await press(() => screen.getByText('Continue'));
  await press(() => screen.getByText('Continue'));
  await press(() => screen.getByText('__pick_slot__'));
  await press(() => screen.getByText('__time_continue__'));
  await waitFor(() => expect(screen.getByText('Review the services')).toBeTruthy());
  await press(() => screen.getByText('Continue to details'));
}

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
  mockParams = {};
  mockRebook.mockReset();
  mockRebook.mockResolvedValue(null);
  guestValues.length = 0;
  confirmGuests.length = 0;
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

describe('ServiceBookingFlow: the chosen client', () => {
  it('carries the client from ?guestId= to the create, and "Book another" clears it', async () => {
    mockParams = { guestId: 'g-1' };
    await renderFlow();
    await walkToGuestStep();
    expect(screen.getByText('__guest_id:g-1__')).toBeTruthy();
    await press(() => screen.getByText('__guest_continue__'));
    await waitFor(() => expect(screen.getByText('__confirm__')).toBeTruthy());
    expect(confirmGuests[confirmGuests.length - 1]).toMatchObject({
      first_name: 'Ana',
      last_name: 'Lopez',
      guest_id: 'g-1',
    });

    await press(() => screen.getByText('__book_another__'));
    await walkToGuestStep();
    expect(screen.getByText('__guest_id:none__')).toBeTruthy();
  });

  it('carries a rebooked client named by the rebook', async () => {
    mockRebook.mockResolvedValue({ v: 1, guest: { firstName: 'Bo', lastName: 'Ray', guestId: 'g-2' } });
    await renderFlow();
    await walkToGuestStep();
    expect(screen.getByText('__guest_id:g-2__')).toBeTruthy();
    expect(guestValues[guestValues.length - 1]).toMatchObject({ first_name: 'Bo', last_name: 'Ray', guest_id: 'g-2' });
  });

  it('holds no client when opened without one', async () => {
    await renderFlow();
    await walkToGuestStep();
    expect(screen.getByText('__guest_id:none__')).toBeTruthy();
  });
});
