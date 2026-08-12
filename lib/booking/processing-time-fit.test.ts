import {
  describeProcessingChange,
  describeProcessingGaps,
  effectiveProcessingTemplate,
  fitProcessingBlocksToDuration,
  parseProcessingTimeBlocks,
  PROCESSING_BLOCK_MIN_MINUTES,
} from '@/lib/booking/processing-time-fit';

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
});

describe('fitProcessingBlocksToDuration', () => {
  const gap = (start: number, duration: number) => ({
    id: `b${start}`,
    start_minute: start,
    duration_minutes: duration,
  });

  it('leaves blocks alone when they already fit', () => {
    const blocks = [gap(15, 30)];
    const fit = fitProcessingBlocksToDuration(blocks, 90);
    expect(fit.blocks).toEqual(blocks);
    expect(fit.changed).toBe(false);
  });

  it('trims a block that straddles the new end', () => {
    // 90 min appointment with a 15-45 gap, shortened to 30: the gap now ends
    // with the appointment instead of running past it.
    const fit = fitProcessingBlocksToDuration([gap(15, 30)], 30);
    expect(fit.blocks).toEqual([{ id: 'b15', start_minute: 15, duration_minutes: 15 }]);
    expect(fit.trimmed).toHaveLength(1);
    expect(fit.removed).toHaveLength(0);
    expect(fit.changed).toBe(true);
  });

  it('drops a block with no usable room left', () => {
    const fit = fitProcessingBlocksToDuration([gap(15, 30)], 18);
    expect(fit.blocks).toEqual([]);
    expect(fit.removed).toHaveLength(1);
    expect(fit.changed).toBe(true);
  });

  it('drops rather than trims when the trim would go below the minimum', () => {
    // Room is 4 minutes, under the 5-minute floor: a 4-minute gap the server
    // would reject is worse than no gap.
    const fit = fitProcessingBlocksToDuration([gap(15, 30)], 15 + PROCESSING_BLOCK_MIN_MINUTES - 1);
    expect(fit.blocks).toEqual([]);
    expect(fit.removed).toHaveLength(1);
    expect(fit.trimmed).toHaveLength(0);
  });

  it('keeps a trim that lands exactly on the minimum', () => {
    const fit = fitProcessingBlocksToDuration([gap(15, 30)], 15 + PROCESSING_BLOCK_MIN_MINUTES);
    expect(fit.blocks).toEqual([
      { id: 'b15', start_minute: 15, duration_minutes: PROCESSING_BLOCK_MIN_MINUTES },
    ]);
    expect(fit.trimmed).toHaveLength(1);
  });

  it('handles several gaps, keeping, trimming and dropping in one pass', () => {
    const fit = fitProcessingBlocksToDuration([gap(10, 10), gap(30, 20), gap(70, 15)], 40);
    expect(fit.blocks).toEqual([
      { id: 'b10', start_minute: 10, duration_minutes: 10 },
      { id: 'b30', start_minute: 30, duration_minutes: 10 },
    ]);
    expect(fit.trimmed.map((b) => b.id)).toEqual(['b30']);
    expect(fit.removed.map((b) => b.id)).toEqual(['b70']);
  });

  it('sorts by start so the result is stable whatever order it was given', () => {
    const fit = fitProcessingBlocksToDuration([gap(60, 10), gap(10, 10)], 120);
    expect(fit.blocks.map((b) => b.start_minute)).toEqual([10, 60]);
  });

  it('lengthening leaves gaps where the practitioner put them', () => {
    const blocks = [gap(15, 30)];
    const fit = fitProcessingBlocksToDuration(blocks, 240);
    expect(fit.blocks).toEqual(blocks);
    expect(fit.changed).toBe(false);
  });

  it('clears everything at a zero or negative duration without throwing', () => {
    expect(fitProcessingBlocksToDuration([gap(15, 30)], 0).blocks).toEqual([]);
    expect(fitProcessingBlocksToDuration([gap(15, 30)], -10).blocks).toEqual([]);
  });

  it('is a no-op on an empty list', () => {
    const fit = fitProcessingBlocksToDuration([], 30);
    expect(fit.blocks).toEqual([]);
    expect(fit.changed).toBe(false);
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
});

describe('describeProcessingChange', () => {
  it('stays quiet when nothing about the processing time changes', () => {
    expect(describeProcessingChange({ removed: 0, trimmed: 0, serviceChanged: false })).toBeNull();
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
