/**
 * The event booking flow (web parity 2026-09-23).
 *
 * E-9: sold-out dates, times and events are listed but cannot be picked,
 * labelled "Sold out" (ticket tiers too), and a date with no tickets left is
 * marked on the calendar, instead of all of it quietly disappearing.
 *
 * E-5: booking for a live collective reads the staff offerings route (which adds
 * this venue's own unlisted events), and one of those books as the venue's own,
 * with no `owner_venue_id`; a listed event still books for the collective.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type {
  EventAvailabilitySlot,
  EventOfferingSummary,
  EventOfferingsResponse,
} from '@/types/booking-offerings';

let mockForm = {
  venueId: 'venue-1' as string | null,
  timeZone: 'Europe/London',
  currency: 'GBP',
  isCollective: false,
  ownerVenueId: null as string | null,
};
let mockLinkedOwner: string | null = null;
let mockOfferings: EventOfferingsResponse = { venue_id: 'venue-1', from: '', to: '', events: [], instances: [] };
const mockUseEventOfferings = jest.fn();
const mockConfirmProps: Record<string, unknown>[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/lib/queries/useBookingFormVenue', () => ({ useBookingFormVenue: () => mockForm }));
jest.mock('@/providers/LinkedVenueProvider', () => ({
  useLinkedVenueContext: () => ({ ownerVenueId: mockLinkedOwner }),
}));
jest.mock('@/lib/queries/useGuestDetail', () => ({ useGuestDetail: () => ({ data: null }) }));
jest.mock('@/lib/queries/useBookableOfferings', () => ({
  useEventOfferings: (...args: unknown[]) => {
    mockUseEventOfferings(...args);
    return { data: mockOfferings, isLoading: false, isError: false, error: null, refetch: jest.fn() };
  },
}));
jest.mock('@/lib/analytics', () => ({ ANALYTICS_EVENTS: { createBookingCompleted: 'x' }, track: jest.fn() }));
// The guest form has its own suite; here it only needs to move the flow on.
jest.mock('@/components/booking-wizard/GuestDetailsStep', () => {
  const { Pressable, Text } = require('react-native');
  return {
    GuestDetailsStep: ({ onContinue }: { onContinue: () => void }) => (
      <Pressable onPress={onContinue}>
        <Text>__guest_done__</Text>
      </Pressable>
    ),
  };
});
// Capture what the confirm step would create, rather than creating it.
jest.mock('@/components/booking-wizard/BookingFlowPrimitives', () => {
  const actual = jest.requireActual('@/components/booking-wizard/BookingFlowPrimitives');
  return {
    ...actual,
    BookingFlowConfirm: (props: Record<string, unknown>) => {
      mockConfirmProps.push(props);
      return null;
    },
  };
});

import { EventBookingFlow } from '@/components/booking-wizard/EventBookingFlow';

function occurrence(overrides: Partial<EventAvailabilitySlot>): EventAvailabilitySlot {
  return {
    event_id: 'e-1',
    series_key: 'open-evening',
    parent_event_id: null,
    event_name: 'Open evening',
    event_date: '2030-01-05',
    start_time: '18:00:00',
    end_time: '20:00:00',
    description: null,
    image_url: null,
    total_capacity: 20,
    remaining_capacity: 5,
    payment_requirement: 'none',
    deposit_amount_pence: null,
    cancellation_notice_hours: 24,
    ticket_types: [{ id: 'adult', name: 'Adult', price_pence: 1000, capacity: null, remaining: 5, sort_order: 0 }],
    ...overrides,
  };
}

function summary(overrides: Partial<EventOfferingSummary>): EventOfferingSummary {
  return {
    series_key: 'open-evening',
    event_name: 'Open evening',
    description: null,
    image_url: null,
    dates: ['2030-01-05'],
    occurrence_count: 1,
    from_price_pence: 1000,
    payment_requirement: 'none',
    deposit_amount_pence: null,
    ...overrides,
  };
}

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderFlow() {
  await render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <EventBookingFlow onCreated={jest.fn()} />
    </SafeAreaProvider>,
  );
}

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirmProps.length = 0;
  mockForm = { venueId: 'venue-1', timeZone: 'Europe/London', currency: 'GBP', isCollective: false, ownerVenueId: null };
  mockLinkedOwner = null;
});

describe('EventBookingFlow: Sold out (E-9)', () => {
  beforeEach(() => {
    mockOfferings = {
      venue_id: 'venue-1',
      from: '2030-01-01',
      to: '2030-04-01',
      // The summaries only count occurrences with tickets, so the gala has none.
      events: [summary({ dates: ['2030-01-05'], occurrence_count: 1 })],
      instances: [
        occurrence({
          event_id: 'open-early',
          start_time: '18:00:00',
          end_time: '20:00:00',
          remaining_capacity: 5,
          ticket_types: [
            { id: 'adult', name: 'Adult', price_pence: 1000, capacity: null, remaining: 5, sort_order: 0 },
            { id: 'vip', name: 'VIP', price_pence: 3000, capacity: 4, remaining: 0, sort_order: 1 },
          ],
        }),
        occurrence({ event_id: 'open-late', start_time: '21:00:00', end_time: '22:00:00', remaining_capacity: 0 }),
        occurrence({ event_id: 'open-next', event_date: '2030-01-12', remaining_capacity: 0 }),
        occurrence({
          event_id: 'gala-1',
          series_key: 'gala',
          event_name: 'Winter gala',
          event_date: '2030-01-19',
          remaining_capacity: 0,
        }),
      ],
    };
  });

  it('lists an event whose every date is sold out, labelled Sold out, and it cannot be picked', async () => {
    await renderFlow();

    const gala = screen.getByLabelText('Winter gala, sold out');
    expect(gala.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('Every upcoming date is sold out')).toBeTruthy();
    expect(screen.getByText('Sold out')).toBeTruthy();
    // Nothing opens from it, so it has no chevron.
    expect(JSON.stringify(gala, ['props', 'children', 'name'])).not.toContain('chevron');
    // The open event beside it keeps its chevron.
    expect(JSON.stringify(screen.toJSON(), ['props', 'children', 'name'])).toContain('chevron');

    await press(() => screen.getByLabelText('Winter gala, sold out'));
    expect(screen.getByText('Choose an event')).toBeTruthy();
  });

  it('marks a sold-out date on the calendar, and it cannot be chosen', async () => {
    await renderFlow();
    await press(() => screen.getByText('Open evening'));

    const soldOutDay = screen.getByLabelText('2030-01-12, sold out');
    expect(soldOutDay.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('Sold out: no tickets left on that date.')).toBeTruthy();
  });

  it('lists a sold-out time, marked Sold out, and labels a sold-out ticket tier Sold out', async () => {
    await renderFlow();
    await press(() => screen.getByText('Open evening'));
    await press(() => screen.getByLabelText('2030-01-05, available'));
    await press(() => screen.getByText('Continue'));

    const late = screen.getByLabelText('9:00pm – 10:00pm, sold out');
    expect(late.props.accessibilityState).toMatchObject({ disabled: true });
    // No time is chosen for you while a sold-out one shares the date.
    expect(screen.queryByLabelText(/^Adult/)).toBeNull();

    await press(() => screen.getByLabelText('6:00pm – 8:00pm'));
    // The chosen time and its Adult tier both have five left.
    expect(screen.getAllByText('5 tickets left')).toHaveLength(2);
    expect(screen.getByLabelText(/^VIP/)).toBeTruthy();
    // The late time and the VIP tier; the tier used to read "Fully booked".
    expect(screen.getAllByText('Sold out')).toHaveLength(2);
    expect(screen.queryByText('Fully booked')).toBeNull();
  });
});

describe("EventBookingFlow: a collective's own unlisted events (E-5)", () => {
  const COLLECTIVE = 'col-1';

  async function bookFirstEvent() {
    await renderFlow();
    await press(() => screen.getByText('Open evening'));
    await press(() => screen.getByLabelText('2030-01-05, available'));
    await press(() => screen.getByText('Continue'));
    await act(async () => {
      fireEvent(screen.getByLabelText(/^Adult/), 'accessibilityAction', {
        nativeEvent: { actionName: 'increment' },
      });
    });
    await press(() => screen.getByText('Continue'));
    await press(() => screen.getByText('__guest_done__'));
    const confirm = mockConfirmProps[mockConfirmProps.length - 1]!;
    const build = confirm.buildPayload as (args: { source: 'phone'; requireDeposit: boolean }) => Record<string, unknown>;
    return build({ source: 'phone', requireDeposit: false });
  }

  beforeEach(() => {
    mockForm = { ...mockForm, venueId: COLLECTIVE, isCollective: true, ownerVenueId: COLLECTIVE };
    mockLinkedOwner = COLLECTIVE;
  });

  it('reads the staff route for the collective', async () => {
    mockOfferings = { venue_id: COLLECTIVE, from: '', to: '', events: [], instances: [] };
    await renderFlow();
    expect(mockUseEventOfferings).toHaveBeenCalledWith(
      COLLECTIVE,
      expect.objectContaining({ staffCollectiveId: COLLECTIVE }),
    );
  });

  it("books the venue's own unlisted event as its own, with no owner", async () => {
    mockOfferings = {
      venue_id: COLLECTIVE,
      from: '',
      to: '',
      events: [summary({ venue_id: 'own-venue', venue_name: 'Glow' })],
      instances: [occurrence({ venue_id: 'own-venue', venue_name: 'Glow' })],
    };
    const payload = await bookFirstEvent();
    expect(payload.experience_event_id).toBe('e-1');
    expect(payload).not.toHaveProperty('owner_venue_id');
  });

  it('books a listed event for the collective', async () => {
    mockOfferings = {
      venue_id: COLLECTIVE,
      from: '',
      to: '',
      events: [summary({ venue_id: 'member-2', venue_name: 'Shine', collective_listing_id: 'listing-1' })],
      instances: [occurrence({ venue_id: 'member-2', venue_name: 'Shine', collective_listing_id: 'listing-1' })],
    };
    const payload = await bookFirstEvent();
    expect(payload.owner_venue_id).toBe(COLLECTIVE);
  });
});
