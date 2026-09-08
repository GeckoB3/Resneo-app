import {
  describeProcessingChange,
  describeProcessingGaps,
  effectiveProcessingTemplate,
  fitProcessingBlocksToDuration,
  parseProcessingTimeBlocks,
  placeNewProcessingBlock,
  processingActiveEndMinutes,
  processingTailMinutes,
  resizeProcessingBlock,
  serviceSpanMinutes,
  PROCESSING_BLOCK_DEFAULT_MINUTES,
  PROCESSING_BLOCK_MIN_MINUTES,
} from '@/lib/booking/processing-time-fit';

const gap = (start: number, duration: number, id = `b${start}`) => ({
  id,
  start_minute: start,
  duration_minutes: duration,
});

describe('parseProcessingTimeBlocks', () => {
  it('reads well-formed blocks off the wire', () => {
    expect(
      parseProcessingTimeBlocks([{ id: 'blk-1', start_minute: 15, duration_minutes: 30 }]),
    ).toEqual([{ id: 'blk-1', start_minute: 15, duration_minutes: 30 }]);
  });

  it('omits the id rather than inventing one', () => {
    // The server back-fills ids; guessing one here would send a block that
    // claims to be a row it is not.
    expect(parseProcessingTimeBlocks([{ start_minute: 10, duration_minutes: 20 }])).toEqual([
      { start_minute: 10, duration_minutes: 20 },
    ]);
  });

  it('treats anything unrecognised as no gaps rather than throwing', () => {
    // Runs on a raw booking column the app does not otherwise type.
    expect(parseProcessingTimeBlocks(null)).toEqual([]);
    expect(parseProcessingTimeBlocks(undefined)).toEqual([]);
    expect(parseProcessingTimeBlocks('[]')).toEqual([]);
    expect(parseProcessingTimeBlocks({ start_minute: 0, duration_minutes: 5 })).toEqual([]);
  });

  it('drops individual malformed entries and keeps the rest', () => {
    expect(
      parseProcessingTimeBlocks([
        { start_minute: 15, duration_minutes: 30 },
        { start_minute: '20', duration_minutes: 10 },
        { start_minute: -5, duration_minutes: 10 },
        { start_minute: 60, duration_minutes: 0 },
        null,
        { start_minute: 90, duration_minutes: 15 },
      ]),
    ).toEqual([
      { start_minute: 15, duration_minutes: 30 },
      { start_minute: 90, duration_minutes: 15 },
    ]);
  });

  it('keeps a block that runs past the end: the tail is not clamped on read', () => {
    // Web #185: a 60-minute colour may carry a 30-minute wait at minute 60.
    expect(parseProcessingTimeBlocks([{ start_minute: 60, duration_minutes: 30 }])).toEqual([
      { start_minute: 60, duration_minutes: 30 },
    ]);
  });
});

describe('processingActiveEndMinutes / processingTailMinutes / serviceSpanMinutes', () => {
  it('reports the whole duration when no block reaches the end', () => {
    expect(processingActiveEndMinutes([gap(15, 30)], 90)).toBe(90);
    expect(processingTailMinutes([gap(15, 30)], 90)).toBe(0);
    expect(serviceSpanMinutes({ durationMinutes: 90, bufferMinutes: 10, processingBlocks: [gap(15, 30)] })).toBe(100);
  });

  it('ends the active span where processing that reaches the end begins', () => {
    // A 60-minute colour, 30 minutes of it a wait at the end: the practitioner
    // is free from minute 30; nothing runs past the end.
    expect(processingActiveEndMinutes([gap(30, 30)], 60)).toBe(30);
    expect(processingTailMinutes([gap(30, 30)], 60)).toBe(0);
    // And a wait AFTER the service: free from 60, the tail is 30, the buffer
    // follows the tail.
    expect(processingActiveEndMinutes([gap(60, 30)], 60)).toBe(60);
    expect(processingTailMinutes([gap(60, 30)], 60)).toBe(30);
    expect(serviceSpanMinutes({ durationMinutes: 60, bufferMinutes: 10, processingBlocks: [gap(60, 30)] })).toBe(100);
    // Straddling: starts inside, finishes after.
    expect(processingActiveEndMinutes([gap(45, 30)], 60)).toBe(45);
    expect(processingTailMinutes([gap(45, 30)], 60)).toBe(15);
  });

  it('treats touching blocks that run to the end as one trailing run', () => {
    expect(processingActiveEndMinutes([gap(20, 20), gap(40, 20)], 60)).toBe(20);
    // A gap before the run does not join it.
    expect(processingActiveEndMinutes([gap(5, 10), gap(40, 20)], 60)).toBe(40);
  });

  it('never counts a tail below zero and tolerates an empty pattern', () => {
    expect(processingTailMinutes([], 30)).toBe(0);
    expect(serviceSpanMinutes({ durationMinutes: 30, bufferMinutes: 0, processingBlocks: null })).toBe(30);
    expect(serviceSpanMinutes({ durationMinutes: -5, bufferMinutes: -5, processingBlocks: undefined })).toBe(0);
  });
});

describe('fitProcessingBlocksToDuration (two-ended, web #185)', () => {
  const fit = (blocks: ReturnType<typeof gap>[], from: number, to: number) =>
    fitProcessingBlocksToDuration(blocks, { fromDurationMinutes: from, toDurationMinutes: to });
  const colour = [gap(15, 30)]; // 60-minute service, a wait in the middle
  const tail = [gap(60, 30, 't')]; // a wait AFTER a 60-minute service
  const endBlock = [gap(50, 10, 'e')]; // a wait running exactly to the end

  it('leaves a middle gap alone when it still fits, lengthened or not', () => {
    const same = fit(colour, 60, 60);
    expect(same.blocks).toEqual(colour);
    expect(same.changed).toBe(false);
    const longer = fit(colour, 60, 120);
    expect(longer.blocks).toEqual(colour);
    expect(longer.changed).toBe(false);
  });

  it('trims a middle gap that straddles the new end', () => {
    const r = fit(colour, 60, 40);
    expect(r.blocks).toEqual([{ id: 'b15', start_minute: 15, duration_minutes: 25 }]);
    expect(r.trimmed).toHaveLength(1);
    expect(r.removed).toHaveLength(0);
    expect(r.shifted).toHaveLength(0);
    expect(r.changed).toBe(true);
  });

  it('removes a middle gap with no room left rather than trimming below the minimum', () => {
    const r = fit(colour, 60, 18);
    expect(r.blocks).toEqual([]);
    expect(r.removed).toHaveLength(1);
    expect(r.trimmed).toHaveLength(0);
  });

  it('keeps a trim that lands exactly on the minimum', () => {
    const r = fit(colour, 60, 15 + PROCESSING_BLOCK_MIN_MINUTES);
    expect(r.blocks).toEqual([
      { id: 'b15', start_minute: 15, duration_minutes: PROCESSING_BLOCK_MIN_MINUTES },
    ]);
    expect(r.trimmed).toHaveLength(1);
  });

  it('removes middle gaps that start at or past the new end', () => {
    expect(fit(colour, 60, 15).blocks).toEqual([]);
    expect(fit(colour, 60, 10).blocks).toEqual([]);
  });

  it('keeps earlier middle gaps while dropping later ones', () => {
    const two = [gap(10, 10), gap(30, 20), gap(70, 15)];
    const r = fit(two, 100, 45);
    expect(r.blocks).toEqual([
      { id: 'b10', start_minute: 10, duration_minutes: 10 },
      { id: 'b30', start_minute: 30, duration_minutes: 15 },
    ]);
    expect(r.trimmed.map((b) => b.id)).toEqual(['b30']);
    expect(r.removed.map((b) => b.id)).toEqual(['b70']);
  });

  it('sorts by start so the result is stable whatever order it was given', () => {
    const r = fit([gap(60, 10), gap(10, 10)], 120, 120);
    expect(r.blocks.map((b) => b.start_minute)).toEqual([10, 60]);
  });

  it('moves a wait that runs past the end with the end, keeping its length', () => {
    // Shortening the service pulls the wait earlier; lengthening pushes it later.
    // A 60 colour with a 30 tail booked with a 30-minute add-on: the tail sits at 90.
    expect(fit(tail, 60, 45).blocks).toEqual([{ id: 't', start_minute: 45, duration_minutes: 30 }]);
    expect(fit(tail, 60, 90).blocks).toEqual([{ id: 't', start_minute: 90, duration_minutes: 30 }]);
    const r = fit(tail, 60, 90);
    expect(r.shifted).toHaveLength(1);
    expect(r.trimmed).toHaveLength(0);
    expect(r.removed).toHaveLength(0);
    expect(r.changed).toBe(true);
  });

  it('moves a gap that runs to the end of the service the same way', () => {
    // The old behaviour clamped this to the new end (or left a hole at 50 when
    // lengthened, which the practitioner is actually working).
    expect(fit(endBlock, 60, 75).blocks).toEqual([{ id: 'e', start_minute: 65, duration_minutes: 10 }]);
    expect(fit(endBlock, 60, 30).blocks).toEqual([{ id: 'e', start_minute: 20, duration_minutes: 10 }]);
  });

  it('moves a whole trailing run of touching blocks together', () => {
    const run = [gap(30, 15, 'r1'), gap(45, 15, 'r2'), gap(60, 20, 'r3')];
    expect(fit(run, 60, 45).blocks).toEqual([
      { id: 'r1', start_minute: 15, duration_minutes: 15 },
      { id: 'r2', start_minute: 30, duration_minutes: 15 },
      { id: 'r3', start_minute: 45, duration_minutes: 20 },
    ]);
  });

  it('never lets a moved wait overlap a middle gap, and never starts it before 0', () => {
    const both = [gap(10, 10, 'm'), gap(60, 30, 't')];
    const r = fit(both, 60, 15);
    // The middle gap is trimmed to the new end (15); the tail moves to 15 and
    // keeps its length, starting no earlier than the trimmed gap ends.
    expect(r.blocks).toEqual([
      { id: 'm', start_minute: 10, duration_minutes: 5 },
      { id: 't', start_minute: 15, duration_minutes: 30 },
    ]);
    expect(fit(tail, 60, 5).blocks).toEqual([{ id: 't', start_minute: 5, duration_minutes: 30 }]);
    expect(fit(tail, 60, 0).blocks).toEqual([{ id: 't', start_minute: 0, duration_minutes: 30 }]);
  });

  it('drops everything for a duration too short to hold any middle gap', () => {
    const r = fit(colour, 60, 4);
    expect(r.blocks).toEqual([]);
    expect(r.removed).toHaveLength(1);
  });

  it('drops a block already shorter than the minimum', () => {
    const r = fit([gap(10, 3)], 60, 60);
    expect(r.blocks).toEqual([]);
    expect(r.removed).toHaveLength(1);
  });

  it('is a no-op on an empty list', () => {
    const r = fit([], 30, 60);
    expect(r.blocks).toEqual([]);
    expect(r.changed).toBe(false);
  });
});

describe('effectiveProcessingTemplate', () => {
  const parent = [{ start_minute: 10, duration_minutes: 10 }];
  const variant = [{ start_minute: 20, duration_minutes: 20 }];

  it('prefers the chosen option pattern when it defines one', () => {
    expect(effectiveProcessingTemplate({ parentBlocks: parent, variantBlocks: variant })).toBe(
      variant,
    );
  });

  it('falls back to the parent when the option defines none', () => {
    expect(effectiveProcessingTemplate({ parentBlocks: parent, variantBlocks: [] })).toBe(parent);
    expect(effectiveProcessingTemplate({ parentBlocks: parent, variantBlocks: null })).toBe(parent);
    expect(effectiveProcessingTemplate({ parentBlocks: parent, variantBlocks: undefined })).toBe(
      parent,
    );
  });

  it('re-fits an inherited parent pattern to the option’s own length (web applyVariantToService)', () => {
    // A 60-minute parent with a wait after it, inherited by a 90-minute option:
    // the wait follows the option's end.
    const tailed = [{ id: 't', start_minute: 60, duration_minutes: 30 }];
    expect(
      effectiveProcessingTemplate({
        parentBlocks: tailed,
        variantBlocks: [],
        parentDurationMinutes: 60,
        variantDurationMinutes: 90,
      }),
    ).toEqual([{ id: 't', start_minute: 90, duration_minutes: 30 }]);
    // Same length: the parent's pattern as it is.
    expect(
      effectiveProcessingTemplate({
        parentBlocks: tailed,
        variantBlocks: null,
        parentDurationMinutes: 60,
        variantDurationMinutes: 60,
      }),
    ).toBe(tailed);
  });
});

describe('placeNewProcessingBlock (service form "Add processing period")', () => {
  it('puts the first block after the service, starting at its end', () => {
    expect(placeNewProcessingBlock([], 60)).toEqual({
      start_minute: 60,
      duration_minutes: PROCESSING_BLOCK_DEFAULT_MINUTES,
    });
    // A middle gap already there still gets the first AFTER-service period.
    expect(placeNewProcessingBlock([gap(10, 10)], 60)).toEqual({
      start_minute: 60,
      duration_minutes: PROCESSING_BLOCK_DEFAULT_MINUTES,
    });
  });

  it('returns null for a service too short to carry processing at all', () => {
    expect(placeNewProcessingBlock([], 4)).toBeNull();
    expect(placeNewProcessingBlock([], 0)).toBeNull();
  });

  it('once a period runs past the end, fills backwards inside the service, clear of it', () => {
    // Tail at 60: the active end is 60, so the next block ends at 55 and is 10 long.
    expect(placeNewProcessingBlock([gap(60, 30)], 60)).toEqual({
      start_minute: 45,
      duration_minutes: PROCESSING_BLOCK_DEFAULT_MINUTES,
    });
  });

  it('uses the latest gap that has room, skipping gaps that are too narrow', () => {
    // Tail at 60 plus a middle block 40–55: the stretch 55–55 is empty, so it
    // goes before the middle block, ending at 40.
    expect(placeNewProcessingBlock([gap(40, 15), gap(60, 30)], 60)).toEqual({
      start_minute: 30,
      duration_minutes: PROCESSING_BLOCK_DEFAULT_MINUTES,
    });
  });

  it('returns null when the service is already full', () => {
    expect(placeNewProcessingBlock([gap(0, 55), gap(60, 30)], 60)).toBeNull();
  });
});

describe('resizeProcessingBlock (service form Length field)', () => {
  it('lengthening a block that runs to the end moves its start earlier', () => {
    expect(resizeProcessingBlock(gap(50, 10), 20, 60)).toEqual({ id: 'b50', start_minute: 40, duration_minutes: 20 });
  });

  it('shortening a block that runs to the end keeps it at the end', () => {
    expect(resizeProcessingBlock(gap(40, 20), 10, 60)).toEqual({ id: 'b40', start_minute: 50, duration_minutes: 10 });
  });

  it('a block that starts at the end grows later, which is how a wait after the service is set', () => {
    expect(resizeProcessingBlock(gap(60, 10), 30, 60)).toEqual({ id: 'b60', start_minute: 60, duration_minutes: 30 });
  });

  it('a middle block keeps its start whatever its length', () => {
    expect(resizeProcessingBlock(gap(10, 10), 25, 60)).toEqual({ id: 'b10', start_minute: 10, duration_minutes: 25 });
  });

  it('never starts before 0: a block longer than the service runs on past its end', () => {
    expect(resizeProcessingBlock(gap(50, 10), 90, 60)).toEqual({ id: 'b50', start_minute: 0, duration_minutes: 90 });
  });
});

describe('describeProcessingChange', () => {
  it('stays quiet when nothing about the processing time changes', () => {
    expect(describeProcessingChange({ removed: 0, trimmed: 0, serviceChanged: false })).toBeNull();
    expect(describeProcessingChange({ removed: 0, trimmed: 0, shifted: 0, serviceChanged: false })).toBeNull();
  });

  it('describes a trim, a drop, and both at once', () => {
    expect(describeProcessingChange({ removed: 0, trimmed: 1, serviceChanged: false })).toBe(
      'Saving will shorten the processing gap so it ends with the appointment.',
    );
    expect(describeProcessingChange({ removed: 2, trimmed: 0, serviceChanged: false })).toBe(
      'This duration is too short for the processing gaps, so saving will remove them.',
    );
    expect(describeProcessingChange({ removed: 1, trimmed: 1, serviceChanged: false })).toBe(
      'This duration cannot hold all of it, so saving will shorten one gap and drop the rest.',
    );
  });

  it('describes a wait that moves with the end', () => {
    expect(describeProcessingChange({ removed: 0, trimmed: 0, shifted: 1, serviceChanged: false })).toBe(
      'The wait after the service moves with the new end.',
    );
    expect(describeProcessingChange({ removed: 1, trimmed: 0, shifted: 2, serviceChanged: false })).toBe(
      'This duration is too short for the processing gap, so saving will remove it. The waits after the service move with the new end.',
    );
  });

  it('leads with the service swap when one happened', () => {
    expect(describeProcessingChange({ removed: 1, trimmed: 0, serviceChanged: true })).toBe(
      'Changing the service swaps in that service’s processing pattern. This duration is too short for the processing gap, so saving will remove it.',
    );
  });
});

describe('describeProcessingGaps', () => {
  it('reads out one gap, two gaps, and none', () => {
    expect(describeProcessingGaps([])).toBeNull();
    expect(describeProcessingGaps([{ start_minute: 15, duration_minutes: 30 }])).toBe(
      '15 to 45 minutes',
    );
    expect(
      describeProcessingGaps([
        { start_minute: 15, duration_minutes: 30 },
        { start_minute: 60, duration_minutes: 15 },
      ]),
    ).toBe('15 to 45 and 60 to 75 minutes');
  });
});
