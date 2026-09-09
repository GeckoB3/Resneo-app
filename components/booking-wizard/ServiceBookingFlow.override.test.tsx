/**
 * Staff "Override availability" (web #187, R29-9): the tick box on the first
 * step of the staff booking flow that books any service with anyone, on any
 * date from today and at any time, with the engine's reasons shown rather than
 * enforced.
 *
 * Pinned here: the catalogue is asked with the override, the pooled option
 * goes away, the date step opens every date, the time step is a typed time
 * whose Continue runs the dry run and lands on the review with "What this
 * overrides", the confirm step carries the flag, and unticking clears the
 * choices. jest hoists mock factories above imports, so closed-over vars are
 * `mock*`.
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

/** With `?override=1` every person lists every service, each saying whether it is assigned. */
const overrideCatalog: AppointmentCatalogResponse = {
  practitioners: [
    {
      id: 'prac-1',
      name: 'Pat',
      services: [
        { id: 'svc-1', name: 'Cut', duration_minutes: 30, buffer_minutes: 0, price_pence: 2500, deposit_pence: null, assigned: true },
        { id: 'svc-2', name: 'Blow-dry', duration_minutes: 20, buffer_minutes: 0, price_pence: 1500, deposit_pence: null, assigned: true },
      ],
    },
    {
      id: 'prac-2',
      name: 'Sam',
      services: [
        { id: 'svc-1', name: 'Cut', duration_minutes: 45, buffer_minutes: 0, price_pence: 3000, deposit_pence: null, assigned: true },
        { id: 'svc-2', name: 'Blow-dry', duration_minutes: 20, buffer_minutes: 0, price_pence: 1500, deposit_pence: null, assigned: false },
      ],
    },
  ],
};

const mockCatalogOptions: unknown[] = [];
jest.mock('@/lib/queries/useAppointmentCatalog', () => ({
  useAppointmentCatalog: (_venueId: string, options: { overrideAvailability?: boolean }) => {
    mockCatalogOptions.push(options);
    return {
      data: options?.overrideAvailability ? overrideCatalog : catalog,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    };
  },
}));
jest.mock('@/lib/queries/useServicesManage', () => ({
  useManagedServices: () => ({ data: { services: [] }, isLoading: false }),
}));
const mockMonthAvailability = jest.fn();
jest.mock('@/lib/queries/useMonthAvailability', () => ({
  useMonthAvailability: (args: { enabled: boolean }) => {
    mockMonthAvailability(args);
    return { data: { available_dates: ['2026-06-20'] }, isLoading: false, isFetching: false };
  },
}));
jest.mock('@/lib/queries/useGuestDetail', () => ({ useGuestDetail: () => ({ data: null }) }));
jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: () => ({ data: { guests: [] }, isFetching: false }),
}));
const mockValidateSlot = jest.fn();
jest.mock('@/lib/queries/useValidateAppointmentSlot', () => ({
  useValidateAppointmentSlot: () => ({ mutateAsync: mockValidateSlot, isPending: false }),
}));

jest.mock('@/lib/queries/useBookingFormVenue', () => ({
  useBookingFormVenue: () => ({
    venueId: 'venue-1',
    timeZone: 'Europe/London',
    anyAvailableEnabled: true,
    staffFirstEnabled: true,
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
  Stack: {
    Screen: ({ options }: { options?: { headerLeft?: () => React.ReactNode } }) =>
      typeof options?.headerLeft === 'function' ? options.headerLeft() : null,
  },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/components/booking-wizard/TimeSlotStep', () => {
  const { Text: T, View: V } = require('react-native');
  return { venueLocalTime: () => '09:00', TimeSlotStep: () => <V><T>__time_step__</T></V> };
});
/** The OS time picker stands in as a button that moves the time to 19:30. */
jest.mock('@/components/ui/TimePickerField', () => {
  const ReactLib = require('react');
  const { Text: T, Pressable } = require('react-native');
  return {
    TimePickerField: ({ onChange }: { onChange: (m: number) => void }) =>
      ReactLib.createElement(Pressable, { onPress: () => onChange(19 * 60 + 30) }, ReactLib.createElement(T, null, 'TIME_PICKER')),
  };
});
/** The guest step stands in as a button: its own validation is pinned in its own suite. */
jest.mock('@/components/booking-wizard/GuestDetailsStep', () => {
  const ReactLib = require('react');
  const { Text: T, Pressable } = require('react-native');
  return {
    GuestDetailsStep: ({ onContinue }: { onContinue: () => void }) =>
      ReactLib.createElement(Pressable, { onPress: onContinue }, ReactLib.createElement(T, null, '__guest_continue__')),
  };
});
const mockConfirmProps: Record<string, unknown>[] = [];
jest.mock('@/components/booking-wizard/ConfirmStep', () => ({
  ConfirmStep: (props: Record<string, unknown>) => {
    mockConfirmProps.push(props);
    return null;
  },
}));

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

/** Tick the box, pick Sam, pick Cut, continue to the date step. */
async function tickAndChoose() {
  await renderFlow();
  await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
  await press(() => screen.getByTestId('availability-override-toggle'));
  await press(() => screen.getByText('Sam'));
  await waitFor(() => expect(screen.getByText('Choose a service')).toBeTruthy());
  await press(() => screen.getByText('Cut'));
  await press(() => screen.getByText('Continue'));
}

beforeEach(() => {
  mockCatalogOptions.length = 0;
  mockConfirmProps.length = 0;
  mockMonthAvailability.mockClear();
  mockValidateSlot.mockReset();
  mockValidateSlot.mockResolvedValue({ ok: true, warnings: ['Outside working hours'] });
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

describe('ServiceBookingFlow — override availability', () => {
  it('asks the catalogue with the override and hides "Any available"', async () => {
    await renderFlow();
    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
    expect(screen.getByText('Any available')).toBeTruthy();

    await press(() => screen.getByTestId('availability-override-toggle'));

    expect(mockCatalogOptions.at(-1)).toEqual(expect.objectContaining({ overrideAvailability: true }));
    expect(screen.queryByText('Any available')).toBeNull();
  });

  it('lists a service the person is not assigned, and says so', async () => {
    await renderFlow();
    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
    await press(() => screen.getByTestId('availability-override-toggle'));
    await press(() => screen.getByText('Sam'));

    await waitFor(() => expect(screen.getByText('Blow-dry')).toBeTruthy());
    expect(screen.getByText(/Not usually offered by Sam/)).toBeTruthy();
  });

  it('opens every date without asking availability, then takes a typed time to the review', async () => {
    await tickAndChoose();

    // The date step: no availability call (the hook is rendered disabled).
    await waitFor(() => expect(screen.queryByText('Choose a service')).toBeNull());
    expect(mockMonthAvailability.mock.calls.every(([args]) => args.enabled === false)).toBe(true);
    await press(() => screen.getByText('Continue'));

    // The time step is the typed time, not the slot list.
    await waitFor(() => expect(screen.getByText('What time?')).toBeTruthy());
    expect(screen.queryByText('__time_step__')).toBeNull();
    await press(() => screen.getByText('TIME_PICKER'));
    await press(() => screen.getByText('Continue'));

    // One dry run for the one service, with the flag, at the typed time.
    await waitFor(() => expect(mockValidateSlot).toHaveBeenCalledTimes(1));
    expect(mockValidateSlot.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        venue_id: 'venue-1',
        booking_date: '2026-06-15',
        practitioner_id: 'prac-2',
        service_id: 'svc-1',
        start_time: '19:30',
        override_availability: true,
        staff: true,
      }),
    );
    await waitFor(() => expect(screen.getByText('What this overrides')).toBeTruthy());
    expect(screen.getByText(/Cut: Outside working hours/)).toBeTruthy();
  });

  it('keeps a refusal the override cannot lift on the time step', async () => {
    mockValidateSlot.mockResolvedValue({ ok: false, error: 'Choose today or a later date.' });
    await tickAndChoose();
    await waitFor(() => expect(screen.queryByText('Choose a service')).toBeNull());
    await press(() => screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText('What time?')).toBeTruthy());
    await press(() => screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByText('Choose today or a later date.')).toBeTruthy());
    expect(screen.queryByText('What this overrides')).toBeNull();
  });

  it('carries the flag to the confirm step', async () => {
    await tickAndChoose();
    await waitFor(() => expect(screen.queryByText('Choose a service')).toBeNull());
    await press(() => screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText('What time?')).toBeTruthy());
    await press(() => screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText('What this overrides')).toBeTruthy());
    await press(() => screen.getByText('Continue to details'));
    await waitFor(() => expect(screen.getByText('__guest_continue__')).toBeTruthy());
    await press(() => screen.getByText('__guest_continue__'));

    await waitFor(() => expect(mockConfirmProps.length).toBeGreaterThan(0));
    expect(mockConfirmProps.at(-1)).toEqual(expect.objectContaining({ overrideAvailability: true }));
  });

  it('unticking clears the choices and returns to the first step', async () => {
    await renderFlow();
    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
    await press(() => screen.getByTestId('availability-override-toggle'));
    await press(() => screen.getByText('Sam'));
    await waitFor(() => expect(screen.getByText('Choose a service')).toBeTruthy());

    // The tick box is on the person step; go back to it and untick.
    await press(() => screen.getByLabelText('Back'));
    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
    await press(() => screen.getByTestId('availability-override-toggle'));

    expect(mockCatalogOptions.at(-1)).toEqual(expect.objectContaining({ overrideAvailability: false }));
    expect(screen.getByText('Any available')).toBeTruthy();
  });
});
