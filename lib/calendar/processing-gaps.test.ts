import {
  bookingProcessingBlocks,
  clusterProcessingGaps,
  occupiedRangesMinusGaps,
  patternLookupFromLinkedServices,
  patternLookupFromManagedServices,
  processingGapRanges,
} from '@/lib/calendar/processing-gaps';
import type { CalendarGridBooking } from '@/types/calendar-grid';
import type { ManagedService } from '@/types/services-manage';

const tintPattern = [{ id: 'g1', start_minute: 30, duration_minutes: 30 }];
const variantPattern = [{ id: 'g2', start_minute: 45, duration_minutes: 15 }];

const lookup = patternLookupFromManagedServices([
  {
    id: 'svc-tint',
    name: 'Tint',
    duration_minutes: 90,
    processing_time_blocks: tintPattern,
    variants: [
      { id: 'var-long', name: 'Long hair', processing_time_blocks: variantPattern },
      { id: 'var-plain', name: 'Plain' },
    ],
  } as unknown as ManagedService,
  { id: 'svc-cut', name: 'Cut', duration_minutes: 30 } as unknown as ManagedService,
]);

function booking(overrides: Partial<CalendarGridBooking>): CalendarGridBooking {
  return {
    id: 'b1',
    guestName: 'Guest',
    serviceName: 'Tint',
    startTime: '11:00',
    endTime: '12:30',
    status: 'Booked',
    ...overrides,
  };
}

describe('bookingProcessingBlocks', () => {
  it('lets a stored snapshot win, even an empty one', () => {
    const snapshot = [{ id: 's', start_minute: 20, duration_minutes: 10 }];
    expect(
      bookingProcessingBlocks(booking({ service_item_id: 'svc-tint', processing_time_blocks: snapshot }), lookup),
    ).toEqual(snapshot);
    expect(
      bookingProcessingBlocks(booking({ service_item_id: 'svc-tint', processing_time_blocks: [] }), lookup),
    ).toEqual([]);
  });

  it('falls back to the service pattern only when the snapshot is missing', () => {
    expect(bookingProcessingBlocks(booking({ service_item_id: 'svc-tint' }), lookup)).toEqual(tintPattern);
    expect(
      bookingProcessingBlocks(booking({ service_item_id: 'svc-tint', processing_time_blocks: null }), lookup),
    ).toEqual(tintPattern);
  });

  it("uses the chosen option's pattern when it defines one, else the service's", () => {
    expect(
      bookingProcessingBlocks(
        booking({ service_item_id: 'svc-tint', service_variant_id: 'var-long' }),
        lookup,
      ),
    ).toEqual(variantPattern);
    expect(
      bookingProcessingBlocks(
        booking({ service_item_id: 'svc-tint', service_variant_id: 'var-plain' }),
        lookup,
      ),
    ).toEqual(tintPattern);
  });

  it('reads the legacy service id when there is no catalogue item, and answers nothing for the unknown', () => {
    expect(bookingProcessingBlocks(booking({ appointment_service_id: 'svc-tint' }), lookup)).toEqual(tintPattern);
    expect(bookingProcessingBlocks(booking({ service_item_id: 'svc-cut' }), lookup)).toEqual([]);
    expect(bookingProcessingBlocks(booking({ service_item_id: 'svc-unknown' }), lookup)).toEqual([]);
    expect(bookingProcessingBlocks(booking({ service_item_id: 'svc-tint' }), null)).toEqual([]);
    expect(bookingProcessingBlocks(booking({}), lookup)).toEqual([]);
  });
});

describe('processingGapRanges and clusterProcessingGaps', () => {
  it('turns blocks into wall-clock ranges clipped to the booking', () => {
    expect(processingGapRanges(660, 750, tintPattern)).toEqual([{ start: 690, end: 720 }]);
    // A block that runs past the booking's end is clipped; one starting after it is dropped.
    expect(
      processingGapRanges(660, 700, [
        { start_minute: 30, duration_minutes: 30 },
        { start_minute: 50, duration_minutes: 10 },
      ]),
    ).toEqual([{ start: 690, end: 700 }]);
  });

  it('unions the gaps of a visit, each against its own segment', () => {
    const gaps = clusterProcessingGaps(
      [
        booking({ id: 'a', startTime: '11:00', endTime: '12:30', service_item_id: 'svc-tint' }),
        booking({ id: 'b', startTime: '12:30', endTime: '13:00', service_item_id: 'svc-cut' }),
        booking({
          id: 'c',
          startTime: '13:00',
          endTime: '14:30',
          processing_time_blocks: [{ start_minute: 0, duration_minutes: 30 }],
        }),
      ],
      lookup,
      30,
    );
    expect(gaps).toEqual([
      { start: 690, end: 720 },
      { start: 780, end: 810 },
    ]);
  });

  it('gives a booking with no end the grid default before reading its blocks', () => {
    expect(
      clusterProcessingGaps(
        [booking({ startTime: '11:00', endTime: '', processing_time_blocks: [{ start_minute: 10, duration_minutes: 10 }] })],
        null,
        30,
      ),
    ).toEqual([{ start: 670, end: 680 }]);
  });
});

describe('occupiedRangesMinusGaps', () => {
  it('splits the span around the gaps, keeping the id on every piece', () => {
    expect(occupiedRangesMinusGaps('b1', 660, 750, [{ start: 690, end: 720 }])).toEqual([
      { id: 'b1', start: 660, end: 690 },
      { id: 'b1', start: 720, end: 750 },
    ]);
  });

  it('drops nothing when there are no gaps, and everything when the gap reaches the end', () => {
    expect(occupiedRangesMinusGaps('b1', 660, 750, [])).toEqual([{ id: 'b1', start: 660, end: 750 }]);
    expect(occupiedRangesMinusGaps('b1', 660, 750, [{ start: 690, end: 750 }])).toEqual([
      { id: 'b1', start: 660, end: 690 },
    ]);
  });
});

describe('patternLookupFromLinkedServices', () => {
  it('parses the raw patterns the linked feed carries, options included', () => {
    const linked = patternLookupFromLinkedServices([
      {
        id: 'svc-x',
        name: 'Colour',
        processingTimeBlocks: [{ start_minute: 20, duration_minutes: 40 }],
        variants: [{ id: 'v1', name: 'Roots', processingTimeBlocks: 'garbage' }],
      },
    ])!;
    expect(linked('svc-x')?.processing_time_blocks).toEqual([{ start_minute: 20, duration_minutes: 40 }]);
    expect(linked('svc-x')?.variants?.[0]?.processing_time_blocks).toEqual([]);
    expect(linked('svc-y')).toBeUndefined();
    expect(patternLookupFromLinkedServices([])).toBeNull();
  });
});
