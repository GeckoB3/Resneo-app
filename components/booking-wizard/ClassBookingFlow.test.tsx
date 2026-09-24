/**
 * The class booking flow (web parity 2026-09-23).
 *
 * E-9: full sessions and all-full classes are listed but cannot be picked,
 * labelled "Full", and a date with no places left is marked on the calendar,
 * instead of all three quietly disappearing.
 *
 * E-5: booking for a live collective reads the staff offerings route (which adds
 * this venue's own unlisted classes), and one of those books as the venue's own,
 * with no `owner_venue_id`; a listed class still books for the collective.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type {
  ClassAvailabilitySlot,
  ClassOfferingSummary,
  ClassOfferingsResponse,
} from '@/types/booking-offerings';

let mockForm = {
  venueId: 'venue-1' as string | null,
  timeZone: 'Europe/London',
  currency: 'GBP',
  isCollective: false,
  ownerVenueId: null as string | null,
};
let mockLinkedOwner: string | null = null;
let mockOfferings: ClassOfferingsResponse = { venue_id: 'venue-1', from: '', to: '', classes: [], instances: [] };
const mockUseClassOfferings = jest.fn();
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
  useClassOfferings: (...args: unknown[]) => {
    mockUseClassOfferings(...args);
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

import { ClassBookingFlow } from '@/components/booking-wizard/ClassBookingFlow';

function slot(overrides: Partial<ClassAvailabilitySlot>): ClassAvailabilitySlot {
  return {
    instance_id: 'i-1',
    class_type_id: 'yoga',
    class_name: 'Yoga',
    description: null,
    instance_date: '2030-01-07',
    start_time: '09:00:00',
    duration_minutes: 60,
    capacity: 10,
    remaining: 3,
    instructor_id: null,
    instructor_name: null,
    price_pence: 1500,
    payment_requirement: 'none',
    deposit_amount_pence: null,
    cancellation_notice_hours: 24,
    requires_stripe_checkout: false,
    colour: '#6366f1',
    ...overrides,
  };
}

function summary(overrides: Partial<ClassOfferingSummary>): ClassOfferingSummary {
  return {
    class_type_id: 'yoga',
    class_name: 'Yoga',
    description: null,
    colour: '#6366f1',
    price_pence: 1500,
    payment_requirement: 'none',
    deposit_amount_pence: null,
    instructor_name: null,
    dates: ['2030-01-07'],
    session_count: 1,
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
      <ClassBookingFlow onCreated={jest.fn()} />
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

describe('ClassBookingFlow: Full (E-9)', () => {
  beforeEach(() => {
    mockOfferings = {
      venue_id: 'venue-1',
      from: '2030-01-01',
      to: '2030-04-01',
      // The summaries only count sessions with places, so all-full Pilates has none.
      classes: [summary({ dates: ['2030-01-07'], session_count: 1 })],
      instances: [
        slot({ instance_id: 'yoga-am', instance_date: '2030-01-07', start_time: '09:00:00', remaining: 3 }),
        slot({ instance_id: 'yoga-pm', instance_date: '2030-01-07', start_time: '18:00:00', remaining: 0 }),
        slot({ instance_id: 'yoga-full-day', instance_date: '2030-01-08', start_time: '09:00:00', remaining: 0 }),
        slot({
          instance_id: 'pilates-1',
          class_type_id: 'pilates',
          class_name: 'Pilates',
          instance_date: '2030-01-09',
          remaining: 0,
        }),
      ],
    };
  });

  it('lists a class whose every session is full, labelled Full, and it cannot be picked', async () => {
    await renderFlow();

    const pilates = screen.getByLabelText('Pilates, full');
    expect(pilates.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('Every upcoming session is full')).toBeTruthy();
    expect(screen.getByText('Full')).toBeTruthy();

    await press(() => screen.getByLabelText('Pilates, full'));
    expect(screen.getByText('Choose a class')).toBeTruthy();
  });

  it('shows "No classes available" only when there is nothing, full or not', async () => {
    mockOfferings = { ...mockOfferings, classes: [], instances: [] };
    await renderFlow();
    expect(screen.getByText('No classes available')).toBeTruthy();
  });

  it('marks a date with no places left as Full on the calendar, and it cannot be chosen', async () => {
    await renderFlow();
    await press(() => screen.getByText('Yoga'));

    const fullDay = screen.getByLabelText('2030-01-08, full');
    expect(fullDay.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByLabelText('2030-01-07, available')).toBeTruthy();
    expect(screen.getByText('Full: every place on that date is taken.')).toBeTruthy();
  });

  it("lists a full session on the date, marked Full, and does not pick the date's open one for you", async () => {
    await renderFlow();
    await press(() => screen.getByText('Yoga'));
    await press(() => screen.getByLabelText('2030-01-07, available'));
    await press(() => screen.getByText('Continue'));

    expect(screen.getByText('Choose a session')).toBeTruthy();
    const pm = screen.getByLabelText('6:00pm, full');
    expect(pm.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('1h · Full')).toBeTruthy();
    // Nothing chosen yet: the open session is not auto-picked when a full one shares the date.
    expect(screen.getByLabelText('9:00am').props.accessibilityState).toMatchObject({ selected: false });

    await press(() => screen.getByLabelText('9:00am'));
    expect(screen.getByLabelText('9:00am').props.accessibilityState).toMatchObject({ selected: true });
  });
});

describe("ClassBookingFlow: a collective's own unlisted classes (E-5)", () => {
  const COLLECTIVE = 'col-1';

  async function bookFirstClass() {
    await renderFlow();
    await press(() => screen.getByText('Yoga'));
    await press(() => screen.getByLabelText('2030-01-07, available'));
    await press(() => screen.getByText('Continue'));
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
    mockOfferings = { venue_id: COLLECTIVE, from: '', to: '', classes: [], instances: [] };
    await renderFlow();
    expect(mockUseClassOfferings).toHaveBeenCalledWith(
      COLLECTIVE,
      expect.objectContaining({ staffCollectiveId: COLLECTIVE }),
    );
  });

  it("books the venue's own unlisted class as its own, with no owner", async () => {
    mockOfferings = {
      venue_id: COLLECTIVE,
      from: '',
      to: '',
      classes: [summary({ venue_id: 'own-venue', venue_name: 'Glow' })],
      instances: [slot({ venue_id: 'own-venue', venue_name: 'Glow' })],
    };
    const payload = await bookFirstClass();
    expect(payload.class_instance_id).toBe('i-1');
    expect(payload).not.toHaveProperty('owner_venue_id');
  });

  it('books a listed class for the collective', async () => {
    mockOfferings = {
      venue_id: COLLECTIVE,
      from: '',
      to: '',
      classes: [summary({ venue_id: 'member-2', venue_name: 'Shine', collective_listing_id: 'listing-1' })],
      instances: [slot({ venue_id: 'member-2', venue_name: 'Shine', collective_listing_id: 'listing-1' })],
    };
    const payload = await bookFirstClass();
    expect(payload.owner_venue_id).toBe(COLLECTIVE);
  });

  it('keeps the public route and the linked owner outside a collective', async () => {
    mockForm = { venueId: 'partner-1', timeZone: 'Europe/London', currency: 'GBP', isCollective: false, ownerVenueId: 'partner-1' };
    mockLinkedOwner = 'partner-1';
    mockOfferings = { venue_id: 'partner-1', from: '', to: '', classes: [summary({})], instances: [slot({})] };
    const payload = await bookFirstClass();
    expect(mockUseClassOfferings).toHaveBeenCalledWith(
      'partner-1',
      expect.objectContaining({ staffCollectiveId: null }),
    );
    expect(payload.owner_venue_id).toBe('partner-1');
  });
});
