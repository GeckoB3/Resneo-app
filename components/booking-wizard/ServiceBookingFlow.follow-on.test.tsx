/**
 * The follow-on step in the staff wizard (web Docs/follow-on-services-plan.md 4.1, 4.3, 5, rules R1
 * to R10): after the services are ticked, the venue's question, with its services as cards. A pick
 * joins the visit as its own service after its trigger; staff can always skip, even a question
 * clients must answer online. The harness is the one `ServiceBookingFlow.visit-people.test.tsx`
 * drives.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';

import { ServiceBookingFlow } from '@/components/booking-wizard/ServiceBookingFlow';

const svc = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  duration_minutes: 30,
  buffer_minutes: 0,
  price_pence: 2500,
  deposit_pence: null,
  ...extra,
});

const cutAfterColour = {
  id: 'g-cut',
  prompt: 'Would you like a cut after your colour?',
  selection_type: 'single' as const,
  required: true,
  trigger_service_ids: ['svc-foils'],
  offered_service_ids: ['svc-cut', 'svc-restyle'],
};

/** Ada does colour and cuts; Ben does restyles only. */
const colourCatalog: AppointmentCatalogResponse = {
  practitioners: [
    {
      id: 'p-ada',
      name: 'Ada',
      services: [svc('svc-foils', 'Full Head Foils', { duration_minutes: 90 }), svc('svc-cut', 'Haircut')],
    },
    { id: 'p-ben', name: 'Ben', services: [svc('svc-restyle', 'Restyle', { price_pence: 4000 })] },
  ],
  follow_on_groups: [cutAfterColour],
} as AppointmentCatalogResponse;

let mockCatalog: AppointmentCatalogResponse = colourCatalog;
const mockVenue = {
  venueId: 'venue-1',
  timeZone: 'Europe/London',
  anyAvailableEnabled: false,
  isLinked: false,
  isCollective: false,
  staffFirstEnabled: false,
};

jest.mock('@/lib/queries/useValidateAppointmentSlot', () => ({
  useValidateAppointmentSlot: () => ({ mutateAsync: jest.fn(), isPending: false }),
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
    data: mockCatalog,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/lib/queries/useServicesManage', () => ({
  useManagedServices: () => ({ data: { services: [] }, isLoading: false }),
}));
/** What the month view was asked: the person and the length of the block. */
const monthAsks: { practitionerId: string | null; durationMinutes: number | null }[] = [];
jest.mock('@/lib/queries/useMonthAvailability', () => ({
  useMonthAvailability: (args: { practitionerId: string | null; durationMinutes: number | null; enabled: boolean }) => {
    if (args.enabled) monthAsks.push({ practitionerId: args.practitionerId, durationMinutes: args.durationMinutes });
    return { data: { available_dates: ['2026-06-20'] }, isLoading: false, isFetching: false };
  },
}));
jest.mock('@/lib/queries/useGuestDetail', () => ({ useGuestDetail: () => ({ data: null }) }));
jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: () => ({ data: { guests: [] }, isFetching: false }),
}));
jest.mock('@/lib/queries/useBookingFormVenue', () => ({
  useBookingFormVenue: () => mockVenue,
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

/** What the time step was asked for: the chain with each service's person. */
const slotAsks: { practitionerId: string; chain: { service_id: string; practitioner_id?: string | null }[] | null }[] = [];
jest.mock('@/components/booking-wizard/TimeSlotStep', () => {
  const { Pressable: P, Text: T, View: V } = require('react-native');
  return {
    venueLocalTime: () => '09:00',
    TimeSlotStep: ({
      chain,
      onSelectSlot,
      onContinue,
      practitionerId,
    }: {
      chain?: { service_id: string; practitioner_id?: string | null }[] | null;
      onSelectSlot: (slot: unknown) => void;
      onContinue: () => void;
      practitionerId: string;
    }) => {
      slotAsks.push({ practitionerId, chain: chain ?? null });
      return (
        <V>
          <P
            accessibilityRole="button"
            onPress={() =>
              onSelectSlot({
                practitioner_id: 'p-steph',
                practitioner_name: 'Steph',
                service_id: 'svc-cut',
                service_name: 'Cut',
                start_time: '10:00:00',
                duration_minutes: 65,
                price_pence: 2500,
                // The server's plan: Cut with Steph at SV Studio, a 5 minute wait, Gel with Bea at SV Nails.
                segments: [
                  {
                    service_id: 'svc-cut',
                    practitioner_id: 'p-steph',
                    practitioner_name: 'Steph',
                    venue_id: 'v-studio',
                    start_time: '10:00',
                    end_time: '10:30',
                    duration_minutes: 30,
                    buffer_minutes: 10,
                    processing_time_blocks: [],
                    wait_before_minutes: 0,
                    price_pence: 2500,
                    deposit_pence: 1000,
                    payment: 'deposit',
                    card_hold_fee_pence: null,
                  },
                  {
                    service_id: 'svc-gel',
                    practitioner_id: 'p-bea',
                    practitioner_name: 'Bea',
                    // One venue's plan names that venue for every service.
                    venue_id: mockVenue.isCollective ? 'v-nails' : 'v-studio',
                    start_time: '10:35',
                    end_time: '11:05',
                    duration_minutes: 30,
                    buffer_minutes: 0,
                    processing_time_blocks: [],
                    wait_before_minutes: 5,
                    price_pence: 3000,
                    deposit_pence: null,
                    payment: 'card_hold',
                    card_hold_fee_pence: 1500,
                  },
                ],
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

/** What the confirm step would book. */
const confirmProps: { segments: unknown; businessParts: unknown }[] = [];
jest.mock('@/components/booking-wizard/ConfirmStep', () => {
  const { Text: T } = require('react-native');
  return {
    ConfirmStep: (props: { multiServiceSegments: unknown; businessParts: unknown }) => {
      confirmProps.push({ segments: props.multiServiceSegments, businessParts: props.businessParts });
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

async function renderFlow() {
  await act(async () => {
    render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <ServiceBookingFlow onCreated={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
}

async function tickAndContinue(...names: string[]) {
  await waitFor(() => expect(screen.getByText(names[0]!)).toBeTruthy());
  for (const name of names) await press(() => screen.getByText(name));
  await press(() => screen.getByText('Continue'));
}

beforeEach(() => {
  mockCatalog = colourCatalog;
  mockVenue.isCollective = false;
  mockVenue.anyAvailableEnabled = false;
  mockVenue.staffFirstEnabled = false;
  slotAsks.length = 0;
  monthAsks.length = 0;
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

describe('ServiceBookingFlow: the follow-on step', () => {
  it('asks after the colour, and a picked cut joins the visit after it', async () => {
    await renderFlow();
    await tickAndContinue('Full Head Foils');

    const step = await screen.findByTestId('follow-on-step');
    expect(within(step).getByText('Would you like a cut after your colour?')).toBeTruthy();
    expect(within(step).getByText('Clients booking online must choose one. You can skip it.')).toBeTruthy();
    expect(within(step).getByText('✓ Full Head Foils')).toBeTruthy();
    expect(within(step).getByText('Haircut')).toBeTruthy();
    expect(within(step).getByText('Restyle')).toBeTruthy();

    await press(() => screen.getByTestId('follow-on-option-svc-cut'));
    expect(screen.getByTestId('follow-on-option-svc-cut').props.accessibilityState).toMatchObject({ checked: true });
    await press(() => screen.getByTestId('follow-on-continue'));

    // Ada does both, so on to the date, then the times for the whole visit in order.
    await waitFor(() => expect(screen.getByText('Choose a date')).toBeTruthy());
    await press(() => screen.getByText('Continue'));
    expect(slotAsks.at(-1)?.chain?.map((c) => c.service_id)).toEqual(['svc-foils', 'svc-cut']);
  });

  it('lets staff skip a question clients must answer online', async () => {
    await renderFlow();
    await tickAndContinue('Full Head Foils');
    await press(() => screen.getByTestId('follow-on-skip'));

    await waitFor(() => expect(screen.getByText('Choose a date')).toBeTruthy());
    await press(() => screen.getByText('Continue'));
    expect(slotAsks.at(-1)?.chain ?? null).toBeNull();
  });

  it('a pick with someone else goes on to a person for each service', async () => {
    await renderFlow();
    await tickAndContinue('Full Head Foils');
    await press(() => screen.getByTestId('follow-on-option-svc-restyle'));
    await press(() => screen.getByTestId('follow-on-continue'));

    await waitFor(() => expect(screen.getByText('Who is each service with?')).toBeTruthy());
    expect(within(screen.getByTestId('visit-people-service-1')).getByText('Ben')).toBeTruthy();
  });

  it('goes back to the services with the colour still ticked', async () => {
    await renderFlow();
    await tickAndContinue('Full Head Foils');
    await screen.findByTestId('follow-on-step');
    await press(() => screen.getByLabelText('Back'));

    await waitFor(() => expect(screen.queryByTestId('follow-on-step')).toBeNull());
    expect(screen.getByText(/1 service/)).toBeTruthy();
  });

  it('does not ask when the colour is ticked with its cut already (R8), or nothing triggers it', async () => {
    await renderFlow();
    await tickAndContinue('Full Head Foils', 'Haircut');
    await waitFor(() => expect(screen.getByText('Choose a date')).toBeTruthy());
    expect(screen.queryByTestId('follow-on-step')).toBeNull();
  });

  it('staff-first: a pick the chosen person does not do is ticked for the next person', async () => {
    mockVenue.staffFirstEnabled = true;
    await renderFlow();
    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
    await press(() => screen.getByText('Ada'));
    await tickAndContinue('Full Head Foils');

    await screen.findByTestId('follow-on-step');
    expect(within(screen.getByTestId('follow-on-option-svc-restyle')).getByText(/with someone else/)).toBeTruthy();
    expect(within(screen.getByTestId('follow-on-option-svc-cut')).queryByText(/with someone else/)).toBeNull();
    await press(() => screen.getByTestId('follow-on-option-svc-restyle'));
    await press(() => screen.getByTestId('follow-on-continue'));

    // Foils stays with Ada; the visit goes on to the next person, as "Add a service with someone else".
    await waitFor(() => expect(screen.getByText('Who else is this visit with?')).toBeTruthy());
    await press(() => screen.getByText('Ben'));
    // Ticked: the list's row and the bar's summary both name it.
    await waitFor(() => expect(screen.getByText(/1 service/)).toBeTruthy());
    expect(screen.getAllByText('Restyle')).toHaveLength(2);
  });
});
