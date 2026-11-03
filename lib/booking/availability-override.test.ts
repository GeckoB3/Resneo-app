import {
  chainCheckBodies,
  chainNoLongerFitsMessage,
  notUsuallyOfferedBy,
  overrideDryRunBodies,
  prefixOverrideWarnings,
} from '@/lib/booking/availability-override';
import {
  recomputeMultiServiceChain,
  type MultiServiceSegment,
} from '@/lib/booking/multi-service-chain';

function segment(over: Partial<MultiServiceSegment>): MultiServiceSegment {
  return {
    serviceId: 'svc-1',
    serviceName: 'Cut',
    practitionerId: 'prac-1',
    practitionerName: 'Ann',
    startTime: '10:00',
    durationMinutes: 45,
    naturalDurationMinutes: 45,
    bufferMinutes: 5,
    pricePence: 3000,
    ...over,
  };
}

describe('overrideDryRunBodies', () => {
  it('asks per segment with the earlier ones as phantoms, the flag, and the custom length', () => {
    const chain = [
      segment({ processingTimeBlocks: [{ start_minute: 20, duration_minutes: 10 }] }),
      segment({
        serviceId: 'svc-2',
        serviceName: 'Colour',
        serviceVariantId: 'var-1',
        addonIds: ['add-1'],
        startTime: '10:50',
        durationMinutes: 70,
        naturalDurationMinutes: 60,
      }),
    ];
    const bodies = overrideDryRunBodies({
      venueId: 'venue-1',
      bookingDate: '2026-09-10',
      chain,
      customDurationOf: (s) => (s.durationMinutes === s.naturalDurationMinutes ? null : s.durationMinutes),
    });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual({
      venue_id: 'venue-1',
      booking_date: '2026-09-10',
      practitioner_id: 'prac-1',
      service_id: 'svc-1',
      start_time: '10:00',
      phantoms: [],
      staff: true,
      override_availability: true,
    });
    expect(bodies[1]).toEqual(
      expect.objectContaining({
        service_id: 'svc-2',
        variant_id: 'var-1',
        addons: [{ addon_id: 'add-1' }],
        start_time: '10:50',
        duration_minutes: 70,
        phantoms: [
          {
            practitioner_id: 'prac-1',
            start_time: '10:00',
            duration_minutes: 45,
            buffer_minutes: 5,
            processing_time_blocks: [{ start_minute: 20, duration_minutes: 10 }],
          },
        ],
      }),
    );
  });
});

describe('the review re-check after a change (split-visit plan G22)', () => {
  const visit = [
    segment({ serviceId: 'cut', serviceName: 'Cut', startTime: '10:00', durationMinutes: 45, bufferMinutes: 0 }),
    segment({ serviceId: 'colour', serviceName: 'Colour', startTime: '10:45', durationMinutes: 60, bufferMinutes: 0 }),
    segment({ serviceId: 'toner', serviceName: 'Toner', startTime: '11:45', durationMinutes: 15, bufferMinutes: 0 }),
  ];

  it('asks the server about the visit as it now is, from its start, without the override', () => {
    // The colour is removed: the toner now follows the cut at 10:45.
    const next = recomputeMultiServiceChain(
      visit.filter((s) => s.serviceId !== 'colour'),
      visit[0]!.startTime,
    );
    const bodies = chainCheckBodies({
      venueId: 'venue-1',
      bookingDate: '2026-11-03',
      chain: next,
      override: false,
      customDurationOf: () => 90,
    });
    expect(bodies.map((b) => [b.service_id, b.start_time])).toEqual([
      ['cut', '10:00'],
      ['toner', '10:45'],
    ]);
    // A plain check: no override flag, and a staff length travels only with the override (web parity).
    for (const body of bodies) {
      expect(body).not.toHaveProperty('override_availability');
      expect(body).not.toHaveProperty('duration_minutes');
      expect(body.staff).toBe(true);
    }
    expect(bodies[1]!.phantoms).toEqual([
      expect.objectContaining({ practitioner_id: 'prac-1', start_time: '10:00', duration_minutes: 45 }),
    ]);
  });

  it('keeps the override when it is on', () => {
    const bodies = chainCheckBodies({
      venueId: 'venue-1',
      bookingDate: '2026-11-03',
      chain: visit,
      override: true,
      customDurationOf: () => null,
    });
    expect(bodies.every((b) => b.override_availability === true)).toBe(true);
  });

  it('says the services no longer fit at the visit start', () => {
    expect(chainNoLongerFitsMessage('10:00:00')).toBe(
      'These services no longer fit at 10:00. Choose another time below.',
    );
  });
});

describe('copy helpers', () => {
  it('prefixes warnings with the service and names the person', () => {
    expect(prefixOverrideWarnings(segment({ serviceName: 'Colour' }), ['Outside working hours'])).toEqual([
      'Colour: Outside working hours',
    ]);
    expect(notUsuallyOfferedBy('Ann')).toBe('Not usually offered by Ann');
    expect(notUsuallyOfferedBy(null)).toBe('Not usually offered by this person');
  });
});
