import type { ProcessingTimeBlock } from '@/types/services-manage';

/**
 * Fitting a booking's processing gaps to a duration staff just changed —
 * ported from web `src/lib/appointments/processing-time.ts`.
 *
 * A booking carries a SNAPSHOT of the processing pattern its service had when
 * it was made (`bookings.processing_time_blocks`). The staff PATCH validates
 * that snapshot against whatever duration the request asks for, and rejects
 * anything that no longer fits:
 *
 *     "Processing blocks must lie within the service duration (before buffer)"
 *
 * So shortening a booking below its last gap's end used to fail outright, with
 * nothing the app could do about it. Fit the blocks here, send them with the
 * change, and the validator judges what will actually be persisted.
 */

/** Shortest gap the server will accept. Anything trimmed below this is dropped. */
export const PROCESSING_BLOCK_MIN_MINUTES = 5;

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

export interface ProcessingFitResult {
  /** Blocks that fit `durationMinutes`, sorted by start. */
  blocks: ProcessingTimeBlock[];
  /** Dropped: they start at or past the new end, or trimming left them too short. */
  removed: ProcessingTimeBlock[];
  /** Kept but shortened so they end with the appointment. */
  trimmed: ProcessingTimeBlock[];
  /** Whether anything was dropped or shortened. */
  changed: boolean;
}

/**
 * Fit blocks to a duration staff just changed.
 *
 * Shortening an appointment must not be refused just because its blocks were
 * snapshotted against a longer one: a block past the new end is dropped, one
 * straddling it is trimmed, and a trim leaving less than
 * {@link PROCESSING_BLOCK_MIN_MINUTES} drops instead. Lengthening leaves blocks
 * where they are, which is where the practitioner actually wants the gap.
 */
export function fitProcessingBlocksToDuration(
  blocks: ProcessingTimeBlock[],
  durationMinutes: number,
): ProcessingFitResult {
  const kept: ProcessingTimeBlock[] = [];
  const removed: ProcessingTimeBlock[] = [];
  const trimmed: ProcessingTimeBlock[] = [];
  const limit = Math.max(0, Math.floor(durationMinutes));

  for (const block of [...blocks].sort((a, b) => a.start_minute - b.start_minute)) {
    const start = Math.max(0, block.start_minute);
    const room = limit - start;
    // Already too short to be a block at all (only reachable from a hand-edited
    // row), or no usable room left before the new end.
    if (block.duration_minutes < PROCESSING_BLOCK_MIN_MINUTES || room < PROCESSING_BLOCK_MIN_MINUTES) {
      removed.push(block);
      continue;
    }
    if (block.duration_minutes <= room) {
      kept.push(start === block.start_minute ? block : { ...block, start_minute: start });
      continue;
    }
    const shortened = { ...block, start_minute: start, duration_minutes: room };
    kept.push(shortened);
    trimmed.push(shortened);
  }

  return { blocks: kept, removed, trimmed, changed: removed.length > 0 || trimmed.length > 0 };
}

/**
 * The catalogue pattern for a service: the chosen option's gaps when it defines
 * any, otherwise the parent service's.
 */
export function effectiveProcessingTemplate(params: {
  parentBlocks: ProcessingTimeBlock[];
  variantBlocks: ProcessingTimeBlock[] | null | undefined;
}): ProcessingTimeBlock[] {
  const variant = params.variantBlocks;
  if (variant && variant.length > 0) return variant;
  return params.parentBlocks;
}

/**
 * What saving will do to the processing time, in words, or null when nothing
 * about it changes (so the form stays quiet on an ordinary time move).
 */
export function describeProcessingChange(params: {
  removed: number;
  trimmed: number;
  serviceChanged: boolean;
}): string | null {
  const { removed, trimmed, serviceChanged } = params;
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
