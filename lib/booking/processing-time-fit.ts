import type { ProcessingTimeBlock } from '@/types/services-manage';

/**
 * Processing time: the periods of an appointment the client sits through while
 * the practitioner is free (colour developing, a mask setting). Ported from web
 * `src/lib/appointments/processing-time.ts` (#185, 2026-09-08).
 *
 * A period may sit INSIDE the service, or START at the service's end and run on
 * past it (web #185). That trailing part is a "tail": it is not part of the
 * service length the client sees, the practitioner is free for it, the buffer
 * follows it rather than the service end, and in a multi-service visit the next
 * service waits behind it. `durationMinutes` everywhere below is the service (or
 * booking) length alone, never the tail.
 *
 * A booking carries a SNAPSHOT of its service's pattern (`bookings.processing_time_blocks`),
 * drawn against the length the booking was made at. The staff PATCH validates
 * whatever the app sends against the requested duration, so a pattern must be
 * re-fitted here from the length it was drawn against to the new one
 * ({@link fitProcessingBlocksToDuration}) before it is sent.
 */

/** Shortest gap the server will accept. Anything trimmed below this is dropped. */
export const PROCESSING_BLOCK_MIN_MINUTES = 5;
/** How far past the end of the service a processing period may run (web `PROCESSING_TAIL_MAX_MINUTES`). */
export const PROCESSING_TAIL_MAX_MINUTES = 480;
/** Default length for a block added in the service form. */
export const PROCESSING_BLOCK_DEFAULT_MINUTES = PROCESSING_BLOCK_MIN_MINUTES * 2;

/**
 * Read blocks off the wire. Deliberately tolerant: an unrecognised shape means
 * "no usable gaps" rather than an exception, because this runs on a raw booking
 * column the app does not otherwise type.
 */
export function parseProcessingTimeBlocks(raw: unknown): ProcessingTimeBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: ProcessingTimeBlock[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, start_minute, duration_minutes } = entry as Record<string, unknown>;
    if (typeof start_minute !== 'number' || !Number.isFinite(start_minute)) continue;
    if (typeof duration_minutes !== 'number' || !Number.isFinite(duration_minutes)) continue;
    if (start_minute < 0 || duration_minutes < 1) continue;
    out.push({
      ...(typeof id === 'string' && id ? { id } : {}),
      start_minute: Math.floor(start_minute),
      duration_minutes: Math.floor(duration_minutes),
    });
  }
  return out;
}

/**
 * Where the practitioner's last busy stretch ends, in minutes from the start.
 *
 * Processing that runs to the end of the service (or past it, or a chain of
 * touching blocks that does) means the practitioner is free from its start
 * onwards, so the calendar has nothing to paint after that point. Equals
 * `durationMinutes` when no block reaches the end.
 */
export function processingActiveEndMinutes(
  blocks: readonly ProcessingTimeBlock[],
  durationMinutes: number,
): number {
  const limit = Math.max(0, durationMinutes);
  let end = limit;
  const sorted = [...blocks].sort((a, b) => b.start_minute - a.start_minute);
  for (const b of sorted) {
    const blockEnd = b.start_minute + b.duration_minutes;
    if (b.start_minute <= end && blockEnd >= end) end = Math.min(end, Math.max(0, b.start_minute));
  }
  return end;
}

/** How far the processing runs past the end of the service (0 when it does not). */
export function processingTailMinutes(
  blocks: readonly ProcessingTimeBlock[],
  durationMinutes: number,
): number {
  const limit = Math.max(0, durationMinutes);
  let maxEnd = limit;
  for (const b of blocks) maxEnd = Math.max(maxEnd, b.start_minute + b.duration_minutes);
  return maxEnd - limit;
}

/**
 * From the start to the moment the diary moves on: the service, any processing
 * that runs past its end, then the buffer. This is what the next service of the
 * same visit waits behind, and the span the working-hours checks fit.
 */
export function serviceSpanMinutes(params: {
  durationMinutes: number;
  bufferMinutes: number;
  processingBlocks: readonly ProcessingTimeBlock[] | null | undefined;
}): number {
  const d = Math.max(0, params.durationMinutes);
  return d + processingTailMinutes(params.processingBlocks ?? [], d) + Math.max(0, params.bufferMinutes);
}

export interface ProcessingFitResult {
  /** Blocks that fit `toDurationMinutes`, sorted by start. */
  blocks: ProcessingTimeBlock[];
  /** Dropped: a middle gap that starts past the new end, or one left too short. */
  removed: ProcessingTimeBlock[];
  /** Kept but shortened. */
  trimmed: ProcessingTimeBlock[];
  /** Kept at their length but moved, because they hang off the end of the service. */
  shifted: ProcessingTimeBlock[];
  /** Whether anything was dropped, shortened or moved. */
  changed: boolean;
}

/**
 * Re-fit a processing pattern from the duration it was drawn against to a new
 * one. Two kinds of block, treated differently:
 *
 * - A gap that runs to the end of the old duration, or past it (a chain of
 *   touching blocks counts as one), is the wait AFTER the practitioner's last
 *   stretch, so it moves with the end: lengthening the service pushes it later,
 *   shortening pulls it earlier. Its length never changes.
 * - A gap in the middle stays where the practitioner put it. Shortening past it
 *   trims it to the new end, and a trim leaving less than
 *   {@link PROCESSING_BLOCK_MIN_MINUTES} drops it instead; one that would now
 *   start after the end is dropped too.
 *
 * A moved tail never overlaps a middle gap (it starts no earlier than the gap
 * ends) and never starts before 0, so the result always validates.
 */
export function fitProcessingBlocksToDuration(
  blocks: readonly ProcessingTimeBlock[],
  params: { fromDurationMinutes: number; toDurationMinutes: number },
): ProcessingFitResult {
  const from = Math.max(0, Math.floor(params.fromDurationMinutes));
  const to = Math.max(0, Math.floor(params.toDurationMinutes));
  const sorted = [...blocks].sort((a, z) => a.start_minute - z.start_minute);
  const tailStart = processingActiveEndMinutes(sorted, from);
  const delta = to - from;

  const kept: ProcessingTimeBlock[] = [];
  const removed: ProcessingTimeBlock[] = [];
  const trimmed: ProcessingTimeBlock[] = [];
  const shifted: ProcessingTimeBlock[] = [];
  let prevEnd = 0;

  for (const b of sorted) {
    // Already too short to be a block at all (only reachable from a hand-edited row).
    if (b.duration_minutes < PROCESSING_BLOCK_MIN_MINUTES) {
      removed.push(b);
      continue;
    }
    const reachesEnd = b.start_minute >= tailStart;
    let start = Math.max(0, b.start_minute);
    let end = b.start_minute + b.duration_minutes;
    if (reachesEnd) {
      start += delta;
      end += delta;
    } else if (start > to) {
      removed.push(b);
      continue;
    } else if (end > to) {
      end = to;
    }
    start = Math.max(0, start, prevEnd);
    if (end - start < PROCESSING_BLOCK_MIN_MINUTES) {
      removed.push(b);
      continue;
    }
    const out =
      start === b.start_minute && end - start === b.duration_minutes
        ? b
        : { ...b, start_minute: start, duration_minutes: end - start };
    kept.push(out);
    prevEnd = end;
    if (out.duration_minutes < b.duration_minutes) trimmed.push(out);
    else if (out.start_minute !== b.start_minute) shifted.push(out);
  }

  return {
    blocks: kept,
    removed,
    trimmed,
    shifted,
    changed: removed.length > 0 || trimmed.length > 0 || shifted.length > 0,
  };
}

/**
 * The catalogue pattern for a service: the chosen option's gaps when it defines
 * any, otherwise the parent service's.
 *
 * A parent pattern belongs to the parent's length. When the option's length is
 * known and differs, the inherited pattern is re-fitted to it (web
 * `applyVariantToService`), so a wait after the service still starts where the
 * option ends rather than where the parent would have. Without the two lengths
 * the parent's pattern is returned as it is.
 */
export function effectiveProcessingTemplate(params: {
  parentBlocks: ProcessingTimeBlock[];
  variantBlocks: ProcessingTimeBlock[] | null | undefined;
  parentDurationMinutes?: number | null;
  variantDurationMinutes?: number | null;
}): ProcessingTimeBlock[] {
  const variant = params.variantBlocks;
  if (variant && variant.length > 0) return variant;
  const from = params.parentDurationMinutes;
  const to = params.variantDurationMinutes;
  if (typeof from === 'number' && typeof to === 'number' && from !== to && params.parentBlocks.length > 0) {
    return fitProcessingBlocksToDuration(params.parentBlocks, {
      fromDurationMinutes: from,
      toDurationMinutes: to,
    }).blocks;
  }
  return params.parentBlocks;
}

/**
 * Where the service form places a newly added processing block.
 *
 * The first one goes AFTER the service: it starts at the end and runs on, which
 * is the common case (colour develops once the stylist has finished applying it,
 * the chair is free, and the next service of the visit waits behind it). Once a
 * period already runs past the end, a further one goes at the end of the latest
 * free stretch inside the service, kept clear of the trailing run so the two
 * stay distinct. Returns null when nothing fits.
 */
export function placeNewProcessingBlock(
  blocks: readonly ProcessingTimeBlock[],
  durationMinutes: number,
): Pick<ProcessingTimeBlock, 'start_minute' | 'duration_minutes'> | null {
  const limit = Math.max(0, Math.floor(durationMinutes));
  if (limit < PROCESSING_BLOCK_MIN_MINUTES) return null;
  if (processingTailMinutes(blocks, limit) === 0) {
    return { start_minute: limit, duration_minutes: PROCESSING_BLOCK_DEFAULT_MINUTES };
  }
  const sorted = [...blocks].sort((a, b) => a.start_minute - b.start_minute);
  // Leave one minimum stretch of active time before the trailing run.
  let gapEnd = Math.min(limit, processingActiveEndMinutes(sorted, limit) - PROCESSING_BLOCK_MIN_MINUTES);
  for (let i = sorted.length - 1; i >= -1; i--) {
    const gapStart = i >= 0 ? Math.min(gapEnd, sorted[i]!.start_minute + sorted[i]!.duration_minutes) : 0;
    const room = gapEnd - gapStart;
    if (room >= PROCESSING_BLOCK_MIN_MINUTES) {
      const duration = Math.min(PROCESSING_BLOCK_DEFAULT_MINUTES, room);
      return { start_minute: gapEnd - duration, duration_minutes: duration };
    }
    if (i >= 0) gapEnd = Math.min(gapEnd, sorted[i]!.start_minute);
  }
  return null;
}

/**
 * A block's new position after its length is edited in the service form.
 *
 * Start and Length are what they say, with one exception: a block that ends
 * exactly at the end of the service and starts before it stays anchored there,
 * so making it longer moves its start earlier rather than pushing it past the
 * end. A block that starts at the end (or already runs past it) simply grows
 * later, which is how a period after the service is set. The start never goes
 * below 0.
 */
export function resizeProcessingBlock<T extends Pick<ProcessingTimeBlock, 'start_minute' | 'duration_minutes'>>(
  block: T,
  nextDurationMinutes: number,
  durationMinutes: number,
): T {
  const limit = Math.max(0, Math.floor(durationMinutes));
  const endsAtLimit =
    block.start_minute < limit && block.start_minute + block.duration_minutes === limit;
  const start = endsAtLimit ? Math.max(0, limit - nextDurationMinutes) : block.start_minute;
  return { ...block, start_minute: start, duration_minutes: nextDurationMinutes };
}

/**
 * What saving will do to the processing time, in words, or null when nothing
 * about it changes (so the form stays quiet on an ordinary time move).
 */
export function describeProcessingChange(params: {
  removed: number;
  trimmed: number;
  /** Waits after the service that move with the new end (web #185). */
  shifted?: number;
  serviceChanged: boolean;
}): string | null {
  const { removed, trimmed, serviceChanged } = params;
  const shifted = params.shifted ?? 0;
  const sentences: string[] = [];
  if (serviceChanged) {
    sentences.push('Changing the service swaps in that service’s processing pattern.');
  }
  if (removed > 0 && trimmed > 0) {
    sentences.push(
      'This duration cannot hold all of it, so saving will shorten one gap and drop the rest.',
    );
  } else if (removed > 0) {
    sentences.push(
      removed === 1
        ? 'This duration is too short for the processing gap, so saving will remove it.'
        : 'This duration is too short for the processing gaps, so saving will remove them.',
    );
  } else if (trimmed > 0) {
    sentences.push(
      trimmed === 1
        ? 'Saving will shorten the processing gap so it ends with the appointment.'
        : 'Saving will shorten the processing gaps so they end with the appointment.',
    );
  }
  if (shifted > 0) {
    sentences.push(
      shifted === 1
        ? 'The wait after the service moves with the new end.'
        : 'The waits after the service move with the new end.',
    );
  }
  return sentences.length > 0 ? sentences.join(' ') : null;
}

/** "15 to 45 minutes" / "15 to 45 and 60 to 75 minutes" — the gaps as they stand. */
export function describeProcessingGaps(blocks: ProcessingTimeBlock[]): string | null {
  if (blocks.length === 0) return null;
  const ranges = blocks.map((b) => `${b.start_minute} to ${b.start_minute + b.duration_minutes}`);
  const joined =
    ranges.length <= 1
      ? (ranges[0] ?? '')
      : `${ranges.slice(0, -1).join(', ')} and ${ranges[ranges.length - 1]}`;
  return `${joined} minutes`;
}
