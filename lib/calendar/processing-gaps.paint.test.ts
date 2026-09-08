import {
  bookingBufferMinutes,
  bookingFreeRegions,
  clusterPaintRegions,
  paintedPieceRanges,
  patternLookupFromLinkedServices,
  patternLookupFromManagedServices,
} from '@/lib/calendar/processing-gaps';
import type { CalendarGridBooking } from '@/types/calendar-grid';
import type { ManagedService } from '@/types/services-manage';

/** A 60-minute colour with a 30-minute wait after it and a 10-minute buffer. */
const lookup = patternLookupFromManagedServices([
  {
    id: 'svc-colour',
    name: 'Colour',
    duration_minutes: 60,
    buffer_minutes: 10,
    processing_time_blocks: [{ id: 't', start_minute: 60, duration_minutes: 30 }],
    variants: [{ id: 'var-quick', name: 'Quick', duration_minutes: 60, buffer_minutes: 5 }],
  } as unknown as ManagedService,
  {
    id: 'svc-tint',
    name: 'Tint',
    duration_minutes: 90,
    buffer_minutes: 0,
    processing_time_blocks: [{ id: 'g', start_minute: 30, duration_minutes: 30 }],
  } as unknown as ManagedService,
  { id: 'svc-cut', name: 'Cut', duration_minutes: 30, buffer_minutes: 15 } as unknown as ManagedService,
]);

function booking(overrides: Partial<CalendarGridBooking>): CalendarGridBooking {
  return {
    id: 'b1',
    guestName: 'Guest',
    serviceName: 'Colour',
    startTime: '10:00',
    endTime: '11:00',
    status: 'Booked',
    ...overrides,
  };
}

describe('bookingBufferMinutes', () => {
  it('reads the option’s buffer, else the service’s, else nothing', () => {
    expect(bookingBufferMinutes(booking({ service_item_id: 'svc-colour' }), lookup)).toBe(10);
    expect(
      bookingBufferMinutes(booking({ service_item_id: 'svc-colour', service_variant_id: 'var-quick' }), lookup),
    ).toBe(5);
    expect(bookingBufferMinutes(booking({ service_item_id: 'svc-unknown' }), lookup)).toBe(0);
    expect(bookingBufferMinutes(booking({}), lookup)).toBe(0);
    expect(bookingBufferMinutes(booking({ service_item_id: 'svc-colour' }), null)).toBe(0);
  });

  it('comes off the linked feed for a partner column', () => {
    const linked = patternLookupFromLinkedServices([
      { id: 'p-cut', name: 'Cut', durationMinutes: 30, bufferMinutes: 20 },
    ]);
    expect(bookingBufferMinutes(booking({ service_item_id: 'p-cut' }), linked)).toBe(20);
  });
});

describe('bookingFreeRegions', () => {
  it('reports a wait after the service as a tail, with the whole booking active', () => {
    const free = bookingFreeRegions(booking({ service_item_id: 'svc-colour' }), lookup, 600, 660);
    expect(free).toEqual({ start: 600, end: 660, activeEnd: 660, middle: [], tailMinutes: 30 });
  });

  it('reports a middle gap as a band and no tail', () => {
    const free = bookingFreeRegions(
      booking({ service_item_id: 'svc-tint', endTime: '11:30' }),
      lookup,
      600,
      690,
    );
    expect(free).toEqual({
      start: 600,
      end: 690,
      activeEnd: 690,
      middle: [{ start: 630, end: 660 }],
      tailMinutes: 0,
    });
  });

  it('ends the active span where processing that reaches the end begins', () => {
    // Snapshot: free from minute 30 to the end of a 60-minute booking.
    const free = bookingFreeRegions(
      booking({ processing_time_blocks: [{ start_minute: 30, duration_minutes: 30 }] }),
      lookup,
      600,
      660,
    );
    expect(free.activeEnd).toBe(630);
    expect(free.middle).toEqual([]);
    expect(free.tailMinutes).toBe(0);
  });
});

describe('clusterPaintRegions', () => {
  it('leaves a lone booking with a tail painted whole, with its buffer after the tail', () => {
    const regions = clusterPaintRegions([booking({ service_item_id: 'svc-colour' })], lookup, 30);
    expect(regions.holes).toEqual([]);
    expect(regions.freeTaps).toEqual([]);
    expect(regions.bufferBands).toEqual([{ start: 690, end: 700 }]);
  });

  it('cuts a middle gap and a trailing free stretch out of the bar, both tappable', () => {
    const regions = clusterPaintRegions(
      [
        booking({
          processing_time_blocks: [
            { start_minute: 10, duration_minutes: 10 },
            { start_minute: 45, duration_minutes: 15 },
          ],
          service_item_id: 'svc-cut',
        }),
      ],
      lookup,
      30,
    );
    expect(regions.holes).toEqual([
      { start: 610, end: 620 },
      { start: 645, end: 660 },
    ]);
    expect(regions.freeTaps).toEqual(regions.holes);
    // The cut's 15-minute buffer follows the booking's end (no tail here).
    expect(regions.bufferBands).toEqual([{ start: 660, end: 675 }]);
  });

  it('opens the wait between a visit’s services, tappable for the wait but not the buffer', () => {
    // Colour 10:00–11:00 (wait 30, buffer 10), cut 11:40–12:10.
    const regions = clusterPaintRegions(
      [
        booking({ id: 'colour', service_item_id: 'svc-colour', group_booking_id: 'v' }),
        booking({
          id: 'cut',
          service_item_id: 'svc-cut',
          startTime: '11:40',
          endTime: '12:10',
          group_booking_id: 'v',
        }),
      ],
      lookup,
      30,
    );
    expect(regions.holes).toEqual([{ start: 660, end: 700 }]);
    expect(regions.freeTaps).toEqual([{ start: 660, end: 690 }]);
    expect(regions.bufferBands).toEqual([
      { start: 690, end: 700 },
      { start: 730, end: 745 },
    ]);
    // Two lozenges, one per service, with the wait between them open; and
    // each service reported with its busy stretch so the grid can label it.
    expect(regions.pieces).toEqual([
      { start: 600, end: 660 },
      { start: 700, end: 730 },
    ]);
    expect(regions.segments.map((s) => [s.booking.id, s.start, s.end, s.activeEnd])).toEqual([
      ['colour', 600, 660, 660],
      ['cut', 700, 730, 730],
    ]);
  });

  it('paints a middle gap as two lozenges and a free foot as a shorter one (paintedPieceRanges)', () => {
    expect(paintedPieceRanges(600, 660, [{ start: 620, end: 640 }])).toEqual([
      { start: 600, end: 620 },
      { start: 640, end: 660 },
    ]);
    // A hole that runs past the end is clipped; one that reaches the end
    // leaves the foot unpainted.
    expect(paintedPieceRanges(600, 660, [{ start: 630, end: 700 }])).toEqual([{ start: 600, end: 630 }]);
    expect(paintedPieceRanges(600, 660, [])).toEqual([{ start: 600, end: 660 }]);
  });

  it('draws no buffer for a cancelled or no-show segment', () => {
    expect(
      clusterPaintRegions([booking({ service_item_id: 'svc-colour', status: 'Cancelled' })], lookup, 30)
        .bufferBands,
    ).toEqual([]);
    expect(
      clusterPaintRegions([booking({ service_item_id: 'svc-colour', status: 'No-Show' })], lookup, 30)
        .bufferBands,
    ).toEqual([]);
  });
});
