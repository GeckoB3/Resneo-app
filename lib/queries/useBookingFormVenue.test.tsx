/**
 * `useBookingFormVenue` frames the new-booking form on the staff's own venue, a
 * linked partner, or (web 2026-09-04) a live venue collective. The collective
 * branch is what this pins: the profile's `collective` object flips the form
 * into collective mode, the appointment surface alone is offered, and the two
 * flow flags come from the collective's virtual venue (the host's), not from
 * the caller's own venue and not the single-partner "off" defaults.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { renderHook } from '@testing-library/react-native';

let mockProfile: { data?: unknown; error?: unknown; isLoading: boolean };
let mockOwnerVenueId: string | null;

jest.mock('@/lib/queries/useLinkedCalendar', () => ({
  useLinkedVenueProfile: () => mockProfile,
}));
jest.mock('@/providers/LinkedVenueProvider', () => ({
  useLinkedVenueContext: () => ({ ownerVenueId: mockOwnerVenueId, ownerVenueName: null }),
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: {
      id: 'venue-own',
      name: 'Own Venue',
      timezone: 'Europe/London',
      currency: 'GBP',
      booking_model: 'unified_scheduling',
      active_booking_models: ['unified_scheduling'],
      enabled_models: ['class_session'],
      pricing_tier: 'plus',
      booking_page_config: null,
    },
    featureFlags: {
      resolved: { any_available_practitioner: true, staff_first_booking_flow: true },
    },
    isLoading: false,
  }),
}));

import { useBookingFormVenue } from '@/lib/queries/useBookingFormVenue';

beforeEach(() => {
  mockProfile = { data: undefined, error: undefined, isLoading: false };
  mockOwnerVenueId = null;
});

describe('useBookingFormVenue', () => {
  it('frames the own venue with its own flags and models', async () => {
    const { result } = await renderHook(() => useBookingFormVenue());
    expect(result.current).toMatchObject({
      venueId: 'venue-own',
      isLinked: false,
      isCollective: false,
      anyAvailableEnabled: true,
      staffFirstEnabled: true,
      enabledModels: ['unified_scheduling', 'class_session'],
      ownerVenueId: null,
    });
  });

  it('frames a linked partner as one venue with both flow flags off', async () => {
    mockOwnerVenueId = 'venue-partner';
    mockProfile = {
      isLoading: false,
      data: {
        venue_name: 'Partner Salon',
        venue: { timezone: 'Europe/Dublin', feature_flags: { resolved: { staff_first_booking_flow: true } } },
        booking_model: 'unified_scheduling',
        enabled_models: ['resource_booking'],
        currency: 'EUR',
      },
    };
    const { result } = await renderHook(() => useBookingFormVenue());
    expect(result.current).toMatchObject({
      venueId: 'venue-partner',
      venueName: 'Partner Salon',
      timeZone: 'Europe/Dublin',
      currency: 'EUR',
      isLinked: true,
      isCollective: false,
      anyAvailableEnabled: false,
      staffFirstEnabled: false,
      enabledModels: ['resource_booking'],
      ownerVenueId: 'venue-partner',
    });
  });

  it('frames a collective on its virtual venue, appointment surface only, with the host flags', async () => {
    mockOwnerVenueId = 'col-1';
    mockProfile = {
      isLoading: false,
      data: {
        venue_name: 'The Hair Collective',
        venue: {
          id: 'col-1',
          is_collective: true,
          timezone: 'Europe/London',
          booking_page_config: { services_layout: 'grouped' },
          feature_flags: {
            resolved: { any_available_practitioner: true, staff_first_booking_flow: false },
          },
        },
        booking_model: 'unified_scheduling',
        enabled_models: [],
        currency: 'GBP',
        collective: { id: 'col-1', member_venue_ids: ['venue-own', 'venue-partner'] },
      },
    };
    const { result } = await renderHook(() => useBookingFormVenue());
    expect(result.current).toMatchObject({
      venueId: 'col-1',
      venueName: 'The Hair Collective',
      isLinked: true,
      isCollective: true,
      anyAvailableEnabled: true,
      staffFirstEnabled: false,
      bookingModel: 'unified_scheduling',
      enabledModels: [],
      ownerVenueId: 'col-1',
      isForbidden: false,
      error: null,
    });
  });

  it('reports a link without create permission as forbidden, never as an error', async () => {
    mockOwnerVenueId = 'venue-partner';
    const { ApiError } = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
    mockProfile = { isLoading: false, error: new ApiError('Forbidden', 403) };
    const { result } = await renderHook(() => useBookingFormVenue());
    expect(result.current.isForbidden).toBe(true);
    expect(result.current.error).toBeNull();
  });
});
