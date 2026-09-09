import {
  notUsuallyOfferedBy,
  overrideDryRunBodies,
  prefixOverrideWarnings,
} from '@/lib/booking/availability-override';
import type { MultiServiceSegment } from '@/lib/booking/multi-service-chain';

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

describe('copy helpers', () => {
  it('prefixes warnings with the service and names the person', () => {
    expect(prefixOverrideWarnings(segment({ serviceName: 'Colour' }), ['Outside working hours'])).toEqual([
      'Colour: Outside working hours',
    ]);
    expect(notUsuallyOfferedBy('Ann')).toBe('Not usually offered by Ann');
    expect(notUsuallyOfferedBy(null)).toBe('Not usually offered by this person');
  });
});
