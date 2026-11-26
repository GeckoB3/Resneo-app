import {
  fitProcessingBlocksToDuration,
  placeNewProcessingBlock,
  processingActiveEndMinutes,
  processingTailMinutes,
  resizeProcessingBlock,
  serviceSpanMinutes,
} from './processing-time-fit';

/**
 * The processing-time cases web and app share (codebase standards plan P4.4). The JSON is GENERATED
 * in the web repo (`scripts/gen-processing-fixtures.ts`) and copied here by its
 * `scripts/sync-processing-fixtures.mjs`, with its hash. Do not edit it by hand: a case that fails
 * here means this fit has drifted from the web's.
 */
// The Node built-ins this test needs, with local shapes rather than widening every other file's
// global types (as `lib/api/raw-fetch-guard.test.ts` does).
declare const __dirname: string;
declare function require(id: string): unknown;
const { readFileSync } = require('fs') as { readFileSync: (file: string, encoding: string) => string };
const { join } = require('path') as { join: (...parts: string[]) => string };
const { createHash } = require('crypto') as {
  createHash: (algorithm: string) => { update: (text: string, encoding: string) => { digest: (enc: string) => string } };
};

const text = readFileSync(join(__dirname, 'processing-time.fixtures.json'), 'utf8').replace(/\r\n/g, '\n');
type Block = { start_minute: number; duration_minutes: number };
type Pattern = { name: string; blocks: Block[]; duration: number };
const cases = JSON.parse(text) as {
  activeEnd: (Pattern & { expected: number })[];
  tail: (Pattern & { expected: number })[];
  span: (Pattern & { buffer: number; expected: number })[];
  fit: (Pattern & { to: number; expected: unknown })[];
  place: (Pattern & { expected: unknown })[];
  resize: { block: Block; next: number; duration: number; expected: Block }[];
};

describe('processing-time fixtures shared with the web', () => {
  it('match their committed hash', () => {
    const hash = createHash('sha256').update(text, 'utf8').digest('hex');
    expect(readFileSync(join(__dirname, 'processing-time.fixtures.sha256'), 'utf8').trim()).toBe(hash);
  });

  it.each(cases.activeEnd)('active end: $name', (c) => {
    expect(processingActiveEndMinutes(c.blocks, c.duration)).toBe(c.expected);
  });
  it.each(cases.tail)('tail: $name', (c) => {
    expect(processingTailMinutes(c.blocks, c.duration)).toBe(c.expected);
  });
  it.each(cases.span)('span: $name, buffer $buffer', (c) => {
    expect(serviceSpanMinutes({ durationMinutes: c.duration, bufferMinutes: c.buffer, processingBlocks: c.blocks })).toBe(
      c.expected,
    );
  });
  it.each(cases.fit)('fit: $name, $duration to $to', (c) => {
    expect(fitProcessingBlocksToDuration(c.blocks, { fromDurationMinutes: c.duration, toDurationMinutes: c.to })).toEqual(
      c.expected,
    );
  });
  it.each(cases.place)('place: $name at $duration', (c) => {
    expect(placeNewProcessingBlock(c.blocks, c.duration)).toEqual(c.expected);
  });
  it.each(cases.resize)('resize: $block.start_minute+$block.duration_minutes to $next in $duration', (c) => {
    expect(resizeProcessingBlock(c.block, c.next, c.duration)).toEqual(c.expected);
  });
});
