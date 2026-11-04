/**
 * A visit with a person per service (web split-visit plan 6.1, 7.1, 8.3): the review's segments
 * from the server's plan, hand-laid times, and the money grouped by business.
 */
import type { MultiServiceSegment } from '@/lib/booking/multi-service-chain';
import { buildMultiServicePayload, chainTotalMinutes } from '@/lib/booking/multi-service-chain';
import { chainNamesPeople, serialiseServiceChainParam, type ServiceChainSegmentParam } from '@/lib/booking/service-chain';
import { staffVisitNotice } from '@/lib/booking/staff-calendar-notice';
import {
  chainSpansPeople,
  layVisitSegments,
  segmentsFromVisitPlan,
  visitBusinessParts,
  type VisitPlanAsk,
} from '@/lib/booking/visit-plan';
import type { PlannedVisitSegment } from '@/types/appointment-availability';
import type { AppointmentServiceOption } from '@/types/appointment-catalog';

function option(over: Partial<AppointmentServiceOption> & { serviceId: string; serviceName: string }): AppointmentServiceOption {
  return {
    durationMinutes: 30,
    buffer_minutes: 0,
    pricePence: 2000,
    depositPence: null,
    paymentRequirement: null,
    practitionerId: 'p-1',
    practitionerName: 'Steph',
    addonGroups: [],
    variants: [],
    ...over,
  } as AppointmentServiceOption;
}

function planned(over: Partial<PlannedVisitSegment> & { service_id: string }): PlannedVisitSegment {
  return {
    practitioner_id: 'p-1',
    practitioner_name: 'Steph',
    venue_id: 'v-studio',
    start_time: '10:00',
    end_time: '10:30',
    duration_minutes: 30,
    buffer_minutes: 0,
    processing_time_blocks: [],
    wait_before_minutes: 0,
    price_pence: 2000,
    deposit_pence: null,
    payment: null,
    card_hold_fee_pence: null,
    ...over,
  };
}

function seg(over: Partial<MultiServiceSegment>): MultiServiceSegment {
  return {
    serviceId: 's',
    serviceName: 'S',
    practitionerId: 'p-1',
    practitionerName: 'Steph',
    startTime: '10:00',
    durationMinutes: 30,
    naturalDurationMinutes: 30,
    bufferMinutes: 0,
    pricePence: 2000,
    ...over,
  };
}

const cut = option({
  serviceId: 'svc-cut',
  serviceName: 'Cut',
  addonGroups: [
    {
      id: 'g',
      name: 'Extras',
      addons: [{ id: 'a-1', name: 'Fringe', additional_duration_minutes: 10, additional_price_pence: 500 }],
    },
  ] as unknown as AppointmentServiceOption['addonGroups'],
});
const nails = option({ serviceId: 'svc-nails', serviceName: 'Gel Manicure' });

describe('segmentsFromVisitPlan', () => {
  const asks: VisitPlanAsk[] = [
    { option: cut, variant: null, addonIds: ['a-1'], durationOverride: null },
    { option: nails, variant: null, addonIds: [], durationOverride: null },
  ];

  it("takes the server's times, people, businesses and charges as they are", () => {
    const out = segmentsFromVisitPlan(
      [
        planned({ service_id: 'svc-cut', duration_minutes: 40, price_pence: 2500, buffer_minutes: 10 }),
        planned({
          service_id: 'svc-nails',
          practitioner_id: 'p-2',
          practitioner_name: 'Bea',
          venue_id: 'v-nails',
          start_time: '10:45:00',
          deposit_pence: 1000,
          payment: 'deposit',
        }),
      ],
      asks,
    );
    expect(out).not.toBeNull();
    expect(out!.map((s) => [s.serviceName, s.practitionerName, s.startTime, s.venueId])).toEqual([
      ['Cut', 'Steph', '10:00', 'v-studio'],
      ['Gel Manicure', 'Bea', '10:45', 'v-nails'],
    ]);
    // The price is shown without the add-ons, which have their own line.
    expect(out![0]).toMatchObject({ pricePence: 2000, addonTotalPence: 500, addonTotalMinutes: 10, addonNames: ['Fringe'] });
    expect(out![0]!.durationMinutes).toBe(40);
    // No staff length: nothing custom is sent back.
    expect(out![0]!.naturalDurationMinutes).toBe(40);
    expect(out![1]).toMatchObject({ chargePence: 1000, chargeLabel: 'deposit' });
  });

  it('keeps a staff length as custom against the catalogue length', () => {
    const out = segmentsFromVisitPlan(
      [planned({ service_id: 'svc-cut', duration_minutes: 55 }), planned({ service_id: 'svc-nails', start_time: '11:00' })],
      [{ ...asks[0]!, durationOverride: 45 }, asks[1]!],
    );
    // 30 catalogue + 10 add-on is natural; the plan's 55 is 45 + 10.
    expect(out![0]).toMatchObject({ durationMinutes: 55, naturalDurationMinutes: 40 });
  });

  it('reads a card hold as its no-show fee', () => {
    const out = segmentsFromVisitPlan(
      [
        planned({ service_id: 'svc-cut' }),
        planned({ service_id: 'svc-nails', payment: 'card_hold', card_hold_fee_pence: 1500, deposit_pence: null }),
      ],
      asks,
    );
    expect(out![1]).toMatchObject({ chargePence: 1500, chargeLabel: 'card_hold' });
  });

  it('refuses a plan that does not line up with what was asked', () => {
    expect(segmentsFromVisitPlan([planned({ service_id: 'svc-cut' })], asks)).toBeNull();
    expect(
      segmentsFromVisitPlan([planned({ service_id: 'svc-nails' }), planned({ service_id: 'svc-cut' })], asks),
    ).toBeNull();
  });
});

describe('layVisitSegments', () => {
  it("starts each person's service once the client is free, with no buffer between people", () => {
    const out = layVisitSegments(
      [
        seg({ practitionerId: 'p-1', durationMinutes: 30, bufferMinutes: 15 }),
        seg({ practitionerId: 'p-2', durationMinutes: 20, bufferMinutes: 10 }),
        seg({ practitionerId: 'p-1', durationMinutes: 30, bufferMinutes: 0 }),
      ],
      '10:00',
    );
    // Bea starts at 10:30; Steph's second service waits for her 15-minute buffer (10:45), and the
    // client is free at 10:50.
    expect(out.map((s) => s.startTime)).toEqual(['10:00', '10:30', '10:50']);
  });

  it('lays one person back to back as before', () => {
    const out = layVisitSegments(
      [seg({ durationMinutes: 30, bufferMinutes: 10 }), seg({ durationMinutes: 20, bufferMinutes: 0 })],
      '09:00',
    );
    expect(out.map((s) => s.startTime)).toEqual(['09:00', '09:40']);
  });
});

describe('visitBusinessParts', () => {
  const nameOf = (id: string) => ({ 'v-studio': 'SV Studio', 'v-nails': 'SV Nails' })[id] ?? '';

  it("groups each business's charges, holds apart", () => {
    const parts = visitBusinessParts(
      [
        seg({ venueId: 'v-studio', chargePence: 1000, chargeLabel: 'deposit' }),
        seg({ venueId: 'v-nails', chargePence: 2500, chargeLabel: 'full_payment' }),
        seg({ venueId: 'v-nails', chargePence: 1500, chargeLabel: 'card_hold' }),
      ],
      nameOf,
    );
    expect(parts).toEqual([
      { venueId: 'v-studio', name: 'SV Studio', segmentIndexes: [0], depositPence: 1000, chargeLabel: 'deposit', holdPence: 0 },
      { venueId: 'v-nails', name: 'SV Nails', segmentIndexes: [1, 2], depositPence: 2500, chargeLabel: 'full_payment', holdPence: 1500 },
    ]);
  });

  it('is empty for one business, or segments that do not say which', () => {
    expect(visitBusinessParts([seg({ venueId: 'v-studio' }), seg({ venueId: 'v-studio' })], nameOf)).toEqual([]);
    expect(visitBusinessParts([seg({ venueId: 'v-studio' }), seg({})], nameOf)).toEqual([]);
  });
});

describe('a visit across people', () => {
  it('knows when the services are with more than one person', () => {
    expect(chainSpansPeople([seg({}), seg({})])).toBe(false);
    expect(chainSpansPeople([seg({}), seg({ practitionerId: 'p-2' })])).toBe(true);
  });

  it("times the visit by its services' own starts, so no buffer is added between people", () => {
    const total = chainTotalMinutes([
      seg({ practitionerId: 'p-1', startTime: '10:00', durationMinutes: 30, bufferMinutes: 15 }),
      seg({ practitionerId: 'p-2', startTime: '10:35', durationMinutes: 20 }),
    ]);
    expect(total).toBe(55);
  });

  it("names each service's person in the availability request", () => {
    const chain: ServiceChainSegmentParam[] = [
      { service_id: 'svc-cut', practitioner_id: 'p-1' },
      { service_id: 'svc-nails', practitioner_id: '__any_available__' },
    ];
    expect(chainNamesPeople(chain)).toBe(true);
    expect(chainNamesPeople([{ practitioner_id: null }, {}])).toBe(false);
    expect(JSON.parse(serialiseServiceChainParam(chain))).toEqual(chain);
  });

  it("sends each business's own money choices, and none of the deposits on a walk-in", () => {
    const base = {
      venueId: 'collective-1',
      bookingDate: '2099-06-10',
      contact: { first_name: 'Sam', last_name: 'Carter' },
      segments: [seg({ venueId: 'v-studio' }), seg({ practitionerId: 'p-2', venueId: 'v-nails' })],
      charges: {
        requireDeposit: false,
        requireCardHold: false,
        requireDepositByVenue: { 'v-studio': true, 'v-nails': false },
        requireCardHoldByVenue: { 'v-studio': false, 'v-nails': true },
      },
    };
    const phone = buildMultiServicePayload({ ...base, source: 'phone' });
    expect(phone.require_deposit_by_venue).toEqual({ 'v-studio': true, 'v-nails': false });
    expect(phone.require_card_hold_by_venue).toEqual({ 'v-studio': false, 'v-nails': true });
    expect(phone.services.map((s) => s.practitioner_id)).toEqual(['p-1', 'p-2']);
    const walkIn = buildMultiServicePayload({ ...base, source: 'walk-in' });
    expect(walkIn).not.toHaveProperty('require_deposit_by_venue');
    expect(walkIn.require_card_hold_by_venue).toEqual({ 'v-studio': false, 'v-nails': true });
  });
});

describe('staffVisitNotice', () => {
  const catalog = {
    practitioners: [
      { id: 'p-1', services: [{ id: 'svc-cut' }] },
      {
        id: 'p-2',
        services: [{ id: 'svc-nails', staff_note: 'Card payments are not set up at SV Nails, so take payment in person.', staff_exclusion: 'payments' as const }],
      },
    ],
  };

  it("reads each service's note from its own calendar and names the businesses without cards", () => {
    const notice = staffVisitNotice(catalog, [
      { practitionerId: 'p-1', serviceId: 'svc-cut', venueId: 'v-studio' },
      { practitionerId: 'p-2', serviceId: 'svc-nails', venueId: 'v-nails' },
    ]);
    expect(notice).toEqual({
      notes: ['Card payments are not set up at SV Nails, so take payment in person.'],
      noCards: true,
      noCardVenueIds: ['v-nails'],
    });
  });

  it('says nothing when no calendar has a note', () => {
    expect(staffVisitNotice(catalog, [{ practitionerId: 'p-1', serviceId: 'svc-cut' }])).toEqual({ notes: [], noCards: false });
  });
});
