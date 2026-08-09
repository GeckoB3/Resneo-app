import { timeToMinutes } from '@/lib/booking/booking-format';
import {
  buildGroupPayload,
  buildMultiServicePayload,
  chainTotalMinutes,
  chainTotalPence,
  clientAddressPayloadFields,
  groupTotalPence,
  recomputeMultiServiceChain,
  type GroupPerson,
  type MultiServiceSegment,
} from '@/lib/booking/multi-service-chain';

function seg(overrides: Partial<MultiServiceSegment>): MultiServiceSegment {
  return {
    serviceId: 'svc',
    serviceName: 'Service',
    practitionerId: 'prac',
    practitionerName: 'Pat',
    startTime: '00:00',
    durationMinutes: 30,
    bufferMinutes: 0,
    pricePence: 1000,
    ...overrides,
  };
}

describe('recomputeMultiServiceChain', () => {
  it('anchors the first segment at firstStart and chains by duration + buffer', () => {
    const chain = recomputeMultiServiceChain(
      [
        seg({ serviceId: 'a', durationMinutes: 30, bufferMinutes: 5 }),
        seg({ serviceId: 'b', durationMinutes: 45, bufferMinutes: 0 }),
        seg({ serviceId: 'c', durationMinutes: 20, bufferMinutes: 0 }),
      ],
      '09:00',
    );
    expect(chain.map((s) => s.startTime)).toEqual(['09:00', '09:35', '10:20']);
  });

  it('re-anchors to a new firstStart without mutating inputs', () => {
    const input = [seg({ serviceId: 'a', durationMinutes: 60 }), seg({ serviceId: 'b', durationMinutes: 30 })];
    const chain = recomputeMultiServiceChain(input, '14:15');
    expect(chain.map((s) => s.startTime)).toEqual(['14:15', '15:15']);
    // The original objects are not mutated (new objects returned).
    expect(input[0]!.startTime).toBe('00:00');
  });

  it('handles a single-segment chain', () => {
    const chain = recomputeMultiServiceChain([seg({ durationMinutes: 30 })], '10:00');
    expect(chain).toHaveLength(1);
    expect(chain[0]!.startTime).toBe('10:00');
  });

  it('keeps add-on minutes folded into durationMinutes when chaining', () => {
    const chain = recomputeMultiServiceChain(
      [
        seg({ serviceId: 'a', durationMinutes: 50 /* 30 base + 20 add-on */, bufferMinutes: 0 }),
        seg({ serviceId: 'b', durationMinutes: 30 }),
      ],
      '09:00',
    );
    expect(chain[1]!.startTime).toBe('09:50');
  });

  // Regression: the FIRST chained segment must carry its REAL buffer (not the
  // previously-hardcoded 0). `seedMultiServiceChain` in ServiceBookingFlow now
  // seeds bufferMinutes from the option/variant; the server validates each later
  // segment's start as prev.start + prev.duration + prev.buffer, so a non-zero
  // first-service buffer must push segment 2 out or the create 400s
  // ("Services must be consecutive").
  it('honours a NON-ZERO buffer on the FIRST segment for segment-2 start', () => {
    const chain = recomputeMultiServiceChain(
      [
        seg({ serviceId: 'first', durationMinutes: 30, bufferMinutes: 15 }),
        seg({ serviceId: 'second', durationMinutes: 45, bufferMinutes: 0 }),
      ],
      '09:00',
    );
    // 09:00 + 30 min duration + 15 min buffer = 09:45.
    expect(chain[0]!.startTime).toBe('09:00');
    expect(chain[1]!.startTime).toBe('09:45');
    // The buffer survives onto the segment so the server's check sees it.
    expect(chain[0]!.bufferMinutes).toBe(15);
  });

  it('first-segment buffer is the gap the server expects (start = prev end + buffer)', () => {
    const firstStart = '10:00';
    const firstDuration = 60;
    const firstBuffer = 10;
    const chain = recomputeMultiServiceChain(
      [
        seg({ serviceId: 'a', durationMinutes: firstDuration, bufferMinutes: firstBuffer }),
        seg({ serviceId: 'b', durationMinutes: 20, bufferMinutes: 0 }),
      ],
      firstStart,
    );
    const expectedSecondStartMin =
      timeToMinutes(chain[0]!.startTime) + firstDuration + firstBuffer;
    expect(timeToMinutes(chain[1]!.startTime)).toBe(expectedSecondStartMin);
  });
});

describe('chain totals', () => {
  it('sums the services plus the buffers BETWEEN them', () => {
    // 30 + 5 + 45 = 80. The final 10-minute buffer is clean-down after the
    // client has gone, so it is not part of how long they are here. Counting it
    // (the old 90) made this disagree with the single-service total, which has
    // never included a buffer.
    expect(
      chainTotalMinutes([
        seg({ durationMinutes: 30, bufferMinutes: 5 }),
        seg({ durationMinutes: 45, bufferMinutes: 10 }),
      ]),
    ).toBe(80);
  });

  it('reduces a one-service chain to its bare duration', () => {
    // The consistency this change exists for: adding a second service must move
    // the total by that service plus the buffer before it, never by more.
    expect(chainTotalMinutes([seg({ durationMinutes: 30, bufferMinutes: 15 })])).toBe(30);
    expect(
      chainTotalMinutes([
        seg({ durationMinutes: 30, bufferMinutes: 15 }),
        seg({ durationMinutes: 60, bufferMinutes: 15 }),
      ]),
    ).toBe(105);
  });

  it('is zero for no segments', () => {
    expect(chainTotalMinutes([])).toBe(0);
  });

  it('sums price including add-on totals', () => {
    expect(
      chainTotalPence([
        seg({ pricePence: 1000, addonTotalPence: 500 }),
        seg({ pricePence: 2000 }),
        seg({ pricePence: null, addonTotalPence: 300 }),
      ]),
    ).toBe(3800);
  });
});

describe('clientAddressPayloadFields', () => {
  it('returns {} when there is no line1', () => {
    expect(clientAddressPayloadFields(null)).toEqual({});
    expect(clientAddressPayloadFields({ client_address_city: 'Belfast' })).toEqual({});
  });

  it('trims and includes only non-empty fields', () => {
    expect(
      clientAddressPayloadFields({
        client_address_line1: '  1 High St ',
        client_address_line2: '  ',
        client_address_city: 'Belfast',
        client_address_postcode: ' BT1 1AA ',
      }),
    ).toEqual({
      client_address_line1: '1 High St',
      client_address_city: 'Belfast',
      client_address_postcode: 'BT1 1AA',
    });
  });
});

describe('buildMultiServicePayload', () => {
  const segments = recomputeMultiServiceChain(
    [
      seg({ serviceId: 'a', durationMinutes: 30, serviceVariantId: 'v1', addonIds: ['ad1'] }),
      seg({ serviceId: 'b', durationMinutes: 45 }),
    ],
    '09:00',
  );

  it('mirrors the create-multi-service body: one venue, services[] with chained starts', () => {
    const payload = buildMultiServicePayload({
      venueId: 'venue-1',
      bookingDate: '2026-06-20',
      contact: { first_name: ' Jo ', last_name: ' Bloggs ', phone: '+447700900000', email: 'jo@x.io' },
      source: 'phone',
      segments,
    });
    expect(payload.venue_id).toBe('venue-1');
    expect(payload.booking_date).toBe('2026-06-20');
    expect(payload.first_name).toBe('Jo');
    expect(payload.last_name).toBe('Bloggs');
    expect(payload.source).toBe('phone');
    expect(payload.services).toEqual([
      { service_id: 'a', practitioner_id: 'prac', start_time: '09:00', service_variant_id: 'v1', addons: [{ addon_id: 'ad1' }] },
      { service_id: 'b', practitioner_id: 'prac', start_time: '09:30' },
    ]);
  });

  it('omits empty email/phone and folds the comment into dietary_notes', () => {
    const payload = buildMultiServicePayload({
      venueId: 'venue-1',
      bookingDate: '2026-06-20',
      contact: { first_name: 'Jo', last_name: 'B', phone: '', email: '', dietary_notes: 'Allergic to latex' },
      source: 'walk-in',
      segments,
    });
    expect(payload.email).toBeUndefined();
    expect(payload.phone).toBeUndefined();
    expect(payload.dietary_notes).toBe('Allergic to latex');
    expect(payload.source).toBe('walk-in');
  });

  it('spreads client_address_* when an address is supplied', () => {
    const payload = buildMultiServicePayload({
      venueId: 'venue-1',
      bookingDate: '2026-06-20',
      contact: { first_name: 'Jo', last_name: 'B' },
      source: 'phone',
      segments,
      address: { client_address_line1: '1 High St', client_address_postcode: 'BT1 1AA' },
    });
    expect(payload.client_address_line1).toBe('1 High St');
    expect(payload.client_address_postcode).toBe('BT1 1AA');
  });
});

describe('buildGroupPayload', () => {
  function person(overrides: Partial<GroupPerson>): GroupPerson {
    return {
      label: 'Guest 1',
      serviceId: 'svc',
      serviceName: 'Service',
      practitionerId: 'prac',
      practitionerName: 'Pat',
      bookingDate: '2026-06-20',
      bookingTime: '09:00',
      durationMinutes: 30,
      pricePence: 1000,
      ...overrides,
    };
  }

  it('mirrors the create-group body: people[] with appointment_service_id + per-person slot', () => {
    const payload = buildGroupPayload({
      venueId: 'venue-1',
      contact: { first_name: 'Org', last_name: 'Aniser', phone: '+447700900000' },
      source: 'phone',
      people: [
        person({ label: 'Alex', serviceId: 's1', serviceVariantId: 'v1', bookingTime: '09:00:00' }),
        person({ label: 'Sam', serviceId: 's2', practitionerId: 'prac2', bookingTime: '09:30', addonIds: ['ad1'] }),
      ],
    });
    expect(payload.venue_id).toBe('venue-1');
    expect(payload.people).toEqual([
      { person_label: 'Alex', practitioner_id: 'prac', appointment_service_id: 's1', service_variant_id: 'v1', booking_date: '2026-06-20', booking_time: '09:00' },
      { person_label: 'Sam', practitioner_id: 'prac2', appointment_service_id: 's2', addons: [{ addon_id: 'ad1' }], booking_date: '2026-06-20', booking_time: '09:30' },
    ]);
  });

  it('defaults a blank label to "Guest"', () => {
    const payload = buildGroupPayload({
      venueId: 'venue-1',
      contact: { first_name: 'Org', last_name: 'A' },
      source: 'phone',
      people: [person({ label: '   ' })],
    });
    expect(payload.people[0]!.person_label).toBe('Guest');
  });

  it('groupTotalPence sums attendee price + add-ons', () => {
    expect(
      groupTotalPence([
        person({ pricePence: 1000, addonTotalPence: 200 }),
        person({ pricePence: null, addonTotalPence: 300 }),
      ]),
    ).toBe(1500);
  });
});
