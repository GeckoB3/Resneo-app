import {
  describeProcessingBlockPlacement,
  processingBlocksToDrafts,
  validateProcessingBlocks,
  type ProcessingBlockDraft,
} from '@/components/services/ProcessingTimeBlocksEditor';
import { PROCESSING_TAIL_MAX_MINUTES } from '@/lib/booking/processing-time-fit';

const draft = (start: number | string, duration: number | string, key = `k${start}`): ProcessingBlockDraft => ({
  key,
  start: String(start),
  duration: String(duration),
});

describe('validateProcessingBlocks (web #185 bounds)', () => {
  it('accepts a period inside the service', () => {
    const r = validateProcessingBlocks([draft(15, 30)], 60);
    expect(r.ok).toBe(true);
    expect(r.blocks).toEqual([{ start_minute: 15, duration_minutes: 30 }]);
  });

  it('accepts a period that starts at the end of the service and runs on (a tail)', () => {
    // The old validator refused this ("must fit within the service duration"),
    // which also blocked SAVING any service the web had given a tail.
    const r = validateProcessingBlocks([draft(60, 30)], 60);
    expect(r.ok).toBe(true);
    expect(r.blocks).toEqual([{ start_minute: 60, duration_minutes: 30 }]);
  });

  it('accepts a period that straddles the end', () => {
    expect(validateProcessingBlocks([draft(45, 30)], 60).ok).toBe(true);
  });

  it('refuses a start past the end of the service', () => {
    const r = validateProcessingBlocks([draft(61, 10)], 60);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Processing periods must start within the service, or at its end.');
  });

  it('refuses a tail longer than the server allows', () => {
    const r = validateProcessingBlocks([draft(60, PROCESSING_TAIL_MAX_MINUTES + 1)], 60);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(
      `Processing time cannot run more than ${PROCESSING_TAIL_MAX_MINUTES} minutes past the end of the service.`,
    );
    expect(validateProcessingBlocks([draft(60, PROCESSING_TAIL_MAX_MINUTES)], 60).ok).toBe(true);
  });

  it('still refuses overlaps, short periods and bad numbers', () => {
    // Touching periods are fine; overlapping ones are not.
    expect(validateProcessingBlocks([draft(10, 10), draft(20, 10)], 60).ok).toBe(true);
    expect(validateProcessingBlocks([draft(10, 20), draft(25, 10)], 60).error).toBe(
      'Processing periods must not overlap.',
    );
    expect(validateProcessingBlocks([draft(10, 4)], 60).ok).toBe(false);
    // A cleared Start reads as 0 (the web's numberOrZero); a cleared Length is
    // 0 too, which is under the minimum and refused.
    expect(validateProcessingBlocks([draft('', 10)], 60).blocks).toEqual([
      { start_minute: 0, duration_minutes: 10 },
    ]);
    expect(validateProcessingBlocks([draft(10, '')], 60).ok).toBe(false);
  });

  it('needs a usable service duration first, and passes an empty list through', () => {
    expect(validateProcessingBlocks([draft(0, 5)], 0).ok).toBe(false);
    expect(validateProcessingBlocks([], 0)).toEqual({ ok: true, blocks: [] });
  });

  it('keeps ids and sorts by start', () => {
    const r = validateProcessingBlocks(
      [
        { key: 'b', id: 'id-b', start: '60', duration: '30' },
        { key: 'a', id: 'id-a', start: '10', duration: '10' },
      ],
      60,
    );
    expect(r.blocks).toEqual([
      { id: 'id-a', start_minute: 10, duration_minutes: 10 },
      { id: 'id-b', start_minute: 60, duration_minutes: 30 },
    ]);
  });
});

describe('describeProcessingBlockPlacement', () => {
  it('names where a period sits', () => {
    expect(describeProcessingBlockPlacement({ start_minute: 60, duration_minutes: 30 }, 60)).toBe(
      'After the service, 30 min',
    );
    expect(describeProcessingBlockPlacement({ start_minute: 45, duration_minutes: 30 }, 60)).toBe(
      'Runs 15 min past the end of the service',
    );
    expect(describeProcessingBlockPlacement({ start_minute: 20, duration_minutes: 25 }, 60)).toBe(
      '20 to 45 min into the service',
    );
  });
});

describe('processingBlocksToDrafts', () => {
  it('seeds sorted string drafts keyed by id', () => {
    expect(
      processingBlocksToDrafts([
        { id: 't', start_minute: 60, duration_minutes: 30 },
        { id: 'm', start_minute: 10, duration_minutes: 10 },
      ]),
    ).toEqual([
      { key: 'm', id: 'm', start: '10', duration: '10' },
      { key: 't', id: 't', start: '60', duration: '30' },
    ]);
  });
});
