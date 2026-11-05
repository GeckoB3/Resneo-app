/**
 * A person for each service of a visit (web Docs/split-staff-visit-plan.md 6.1, 7.1, 8.3, 8.9).
 *
 * - Nobody offers every ticked service: the flow goes straight to choosing someone for each.
 * - Someone does, and someone else offers some: the one-person list offers "Choose someone
 *   different for each service".
 * - The times are asked with each service's person, and the review shows the server's plan: who,
 *   when, and the wait between people.
 * - On a collective, a person whose business does not share an address with those already chosen is
 *   left out with the D11 line, and the money is grouped by business for the confirm step.
 *
 * The harness is the one `ServiceBookingFlow.recheck.test.tsx` drives.
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

/** Steph does cuts at SV Studio, Bea nails at SV Nails (same address), Dee nails at SV Away (elsewhere). */
const splitCatalog: AppointmentCatalogResponse = {
  practitioners: [
    {
      id: 'p-steph',
      name: 'Steph',
      owning_venue_id: 'v-studio',
      owning_venue_name: 'SV Studio',
      share_group_ids: ['v-studio', 'v-nails'],
      services: [svc('svc-cut', 'Cut')],
    },
    {
      id: 'p-bea',
      name: 'Bea',
      owning_venue_id: 'v-nails',
      owning_venue_name: 'SV Nails',
      share_group_ids: ['v-studio', 'v-nails'],
      services: [svc('svc-gel', 'Gel Manicure', { price_pence: 3000 })],
    },
    {
      id: 'p-dee',
      name: 'Dee',
      owning_venue_id: 'v-away',
      owning_venue_name: 'SV Away',
      share_group_ids: ['v-away'],
      services: [svc('svc-gel', 'Gel Manicure', { price_pence: 3000 })],
    },
  ],
} as AppointmentCatalogResponse;

/** Steph does both; Bea does nails only. */
const chooseCatalog: AppointmentCatalogResponse = {
  practitioners: [
    { id: 'p-steph', name: 'Steph', services: [svc('svc-cut', 'Cut'), svc('svc-gel', 'Gel Manicure')] },
    { id: 'p-bea', name: 'Bea', services: [svc('svc-gel', 'Gel Manicure')] },
  ],
} as AppointmentCatalogResponse;

let mockCatalog: AppointmentCatalogResponse = splitCatalog;
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

async function renderAndTick() {
  await act(async () => {
    render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <ServiceBookingFlow onCreated={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
  await waitFor(() => expect(screen.getByText('Cut')).toBeTruthy());
  await press(() => screen.getByText('Cut'));
  await press(() => screen.getByText('Gel Manicure'));
  await press(() => screen.getByText('Continue'));
}

beforeEach(() => {
  mockCatalog = splitCatalog;
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

describe('ServiceBookingFlow: a person for each service', () => {
  it('goes straight to a person for each service when nobody offers them all', async () => {
    await renderAndTick();

    expect(screen.getByText('Who is each service with?')).toBeTruthy();
    expect(screen.queryByText('Choose a practitioner')).toBeNull();
    const continueButton = screen.getByTestId('visit-people-continue');
    expect(continueButton.props.accessibilityState?.disabled).toBe(true);

    await press(() => within(screen.getByTestId('visit-people-service-0')).getByText('Steph'));
    await press(() => within(screen.getByTestId('visit-people-service-1')).getByText('Bea'));
    await press(() => screen.getByTestId('visit-people-continue'));

    // The month is asked about Steph's own service only: the next is with someone else (8.3).
    await waitFor(() => expect(monthAsks.length).toBeGreaterThan(0));
    expect(monthAsks.at(-1)).toEqual({ practitionerId: 'p-steph', durationMinutes: null });

    await press(() => screen.getByText('Continue'));
    expect(slotAsks.at(-1)).toEqual({
      practitionerId: 'p-steph',
      chain: [
        expect.objectContaining({ service_id: 'svc-cut', practitioner_id: 'p-steph' }),
        expect.objectContaining({ service_id: 'svc-gel', practitioner_id: 'p-bea' }),
      ],
    });

    await press(() => screen.getByText('__pick_slot__'));
    await press(() => screen.getByText('__time_continue__'));

    // The review shows the plan: who, when, and the wait between people. No "back-to-back".
    await waitFor(() => expect(screen.getByText('Review the services')).toBeTruthy());
    expect(
      screen.getByText("Check the services and who each one is with, then continue to the client's details."),
    ).toBeTruthy();
    expect(screen.getByText('Cut with Steph')).toBeTruthy();
    expect(screen.getByText('Gel Manicure with Bea')).toBeTruthy();
    expect(screen.getByText('5 minute wait')).toBeTruthy();
    expect(screen.queryByText(/back-to-back/)).toBeNull();

    await press(() => screen.getByText('Continue to details'));
    await press(() => screen.getByText('__guest_continue__'));
    await waitFor(() => expect(screen.getByText('__confirm__')).toBeTruthy());
    const booked = confirmProps.at(-1)!.segments as { practitionerId: string; startTime: string }[];
    expect(booked.map((s) => [s.practitionerId, s.startTime])).toEqual([
      ['p-steph', '10:00'],
      ['p-bea', '10:35'],
    ]);
    // One business (not a collective): no money per business.
    expect(confirmProps.at(-1)!.businessParts).toBeNull();
  });

  it('opens on a person for each service when one person offers them all, and one person stays one tap (2026-11-05)', async () => {
    mockCatalog = chooseCatalog;
    await renderAndTick();

    // Straight to a person per service: staff missed the old "Choose someone different" link.
    expect(screen.getByText('Who is each service with?')).toBeTruthy();
    expect(screen.queryByText('Choose someone different for each service')).toBeNull();
    // Steph offers both, so she is listed for each; Bea only for the manicure.
    expect(within(screen.getByTestId('visit-people-service-0')).queryByText('Bea')).toBeNull();
    expect(within(screen.getByTestId('visit-people-service-1')).getByText('Bea')).toBeTruthy();

    // Steph for the first fills the second, which she also does.
    await press(() => within(screen.getByTestId('visit-people-service-0')).getByText('Steph'));
    expect(within(screen.getByTestId('visit-people-service-1')).getByLabelText(/^Steph/).props.accessibilityState?.selected).toBe(true);
    await press(() => screen.getByTestId('visit-people-continue'));
    await press(() => screen.getByText('Continue'));
    // One person for the visit: the chain names nobody, as a visit with one person always did.
    expect(slotAsks.at(-1)!.chain!.every((c) => c.practitioner_id == null)).toBe(true);
  });

  it('asks the month about the services that follow with the same person', async () => {
    mockCatalog = chooseCatalog;
    await renderAndTick();
    await press(() => within(screen.getByTestId('visit-people-service-0')).getByText('Steph'));
    await press(() => screen.getByTestId('visit-people-continue'));
    await waitFor(() => expect(monthAsks.length).toBeGreaterThan(0));
    // Both with Steph: the month asks for the whole 60-minute block.
    expect(monthAsks.at(-1)).toEqual({ practitionerId: 'p-steph', durationMinutes: 60 });
  });

  it('leaves out someone at another address on a collective, and groups the money by business', async () => {
    mockVenue.isCollective = true;
    await renderAndTick();

    await press(() => within(screen.getByTestId('visit-people-service-0')).getByText('Steph'));
    const nails = within(screen.getByTestId('visit-people-service-1'));
    expect(nails.getByText('Bea')).toBeTruthy();
    expect(nails.queryByText('Dee')).toBeNull();
    expect(nails.getByText('Dee works at a different address, so please book Dee separately.')).toBeTruthy();
    // Each person's business is named under them.
    expect(nails.getByText('SV Nails')).toBeTruthy();

    await press(() => nails.getByText('Bea'));
    await press(() => screen.getByTestId('visit-people-continue'));
    await press(() => screen.getByText('Continue'));
    await press(() => screen.getByText('__pick_slot__'));
    await press(() => screen.getByText('__time_continue__'));

    await waitFor(() => expect(screen.getByText('Review the services')).toBeTruthy());
    expect(screen.getByTestId('review-business-0')).toHaveTextContent('SV Studio');
    expect(screen.getByTestId('review-business-1')).toHaveTextContent('SV Nails');

    await press(() => screen.getByText('Continue to details'));
    await press(() => screen.getByText('__guest_continue__'));
    await waitFor(() => expect(screen.getByText('__confirm__')).toBeTruthy());
    expect(confirmProps.at(-1)!.businessParts).toEqual([
      { venueId: 'v-studio', name: 'SV Studio', segmentIndexes: [0], depositPence: 1000, chargeLabel: 'deposit', holdPence: 0 },
      { venueId: 'v-nails', name: 'SV Nails', segmentIndexes: [1], depositPence: 0, chargeLabel: 'deposit', holdPence: 1500 },
    ]);
  });

  it('clears a later choice that no longer shares an address with an earlier one', async () => {
    mockVenue.isCollective = true;
    // Dee also does cuts here, at SV Away.
    mockCatalog = {
      practitioners: splitCatalog.practitioners.map((p) =>
        p.id === 'p-dee' ? { ...p, services: [...p.services, svc('svc-cut', 'Cut')] } : p,
      ),
    } as AppointmentCatalogResponse;
    await renderAndTick();

    // Cut with Steph, then the manicure with Bea.
    await press(() => within(screen.getByTestId('visit-people-service-0')).getByText('Steph'));
    await press(() => within(screen.getByTestId('visit-people-service-1')).getByText('Bea'));
    expect(screen.getByTestId('visit-people-continue').props.accessibilityState?.disabled).toBe(false);

    // Changing the cut to Dee (SV Away) clears Bea, whose business is elsewhere, and Dee, who does
    // the manicure too, takes it (2026-11-05: a choice fills what is not chosen).
    await press(() => within(screen.getByTestId('visit-people-service-0')).getByText('Dee'));
    expect(within(screen.getByTestId('visit-people-service-1')).queryByText('Bea')).toBeNull();
    expect(within(screen.getByTestId('visit-people-service-1')).getByLabelText(/^Dee/).props.accessibilityState?.selected).toBe(true);
    expect(screen.getByTestId('visit-people-continue').props.accessibilityState?.disabled).toBe(false);
  });

  it('staff-first "Any available" for several services asks "any" for each one (2026-11-05)', async () => {
    mockVenue.staffFirstEnabled = true;
    mockVenue.anyAvailableEnabled = true;
    await act(async () => {
      render(
        <SafeAreaProvider initialMetrics={safeAreaMetrics}>
          <ServiceBookingFlow onCreated={jest.fn()} />
        </SafeAreaProvider>,
      );
    });
    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
    await press(() => screen.getByText('Any available'));
    await press(() => screen.getByText('Cut'));
    await press(() => screen.getByText('Gel Manicure'));
    await press(() => screen.getByText('Continue'));
    // The date step, then the times.
    await press(() => screen.getByText('Continue'));
    // Nobody does both: "any" for the whole visit found no times, as it looked for one person.
    await waitFor(() => expect(slotAsks.length).toBeGreaterThan(0));
    expect(slotAsks.at(-1)!.chain).toEqual([
      expect.objectContaining({ service_id: 'svc-cut', practitioner_id: '__any_available__' }),
      expect.objectContaining({ service_id: 'svc-gel', practitioner_id: '__any_available__' }),
    ]);
  });

  it('staff-first: adds a service with someone else, at the same address, and plans them together', async () => {
    mockVenue.isCollective = true;
    mockVenue.staffFirstEnabled = true;
    await act(async () => {
      render(
        <SafeAreaProvider initialMetrics={safeAreaMetrics}>
          <ServiceBookingFlow onCreated={jest.fn()} />
        </SafeAreaProvider>,
      );
    });
    await waitFor(() => expect(screen.getByText('Who is it with?')).toBeTruthy());
    await press(() => screen.getByText('Steph'));
    await press(() => screen.getByText('Cut'));
    await press(() => screen.getByTestId('add-someone-else'));

    // The next person: the visit so far, and someone at another address left out (D11).
    expect(screen.getByText('Who else is this visit with?')).toBeTruthy();
    expect(screen.getByText('Cut with Steph')).toBeTruthy();
    expect(screen.queryByText('Dee')).toBeNull();
    expect(screen.getByText('Dee works at a different address, so please book Dee separately.')).toBeTruthy();

    // Back returns to Steph's services, still ticked; forward again to Bea.
    await press(() => screen.getByLabelText('Back'));
    expect(screen.getByTestId('add-someone-else')).toBeTruthy();
    await press(() => screen.getByTestId('add-someone-else'));
    await press(() => screen.getByText('Bea'));
    // Cut is with Steph already, so it is not listed for Bea.
    expect(screen.queryByText('Cut')).toBeNull();
    await press(() => screen.getByText('Gel Manicure'));
    await press(() => screen.getByText('Continue'));

    await press(() => screen.getByText('Continue'));
    expect(slotAsks.at(-1)).toEqual({
      practitionerId: 'p-steph',
      chain: [
        expect.objectContaining({ service_id: 'svc-cut', practitioner_id: 'p-steph' }),
        expect.objectContaining({ service_id: 'svc-gel', practitioner_id: 'p-bea' }),
      ],
    });
  });
});
