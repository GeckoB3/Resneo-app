import { timeToMinutes } from '@/components/calendar/grid-layout';
import {
  effectiveProcessingTemplate,
  fitProcessingBlocksToDuration,
  parseProcessingTimeBlocks,
  processingActiveEndMinutes,
  processingTailMinutes,
} from '@/lib/booking/processing-time-fit';
import type { MinuteRange } from '@/lib/calendar/booking-cluster-layout';
import type { CalendarGridBooking } from '@/types/calendar-grid';
import type { LinkedService } from '@/types/linked-venues';
import type { ManagedService, ProcessingTimeBlock } from '@/types/services-manage';

/**
 * Which minutes of a booking are processing gaps (the client is under the
 * colour and the chair is free), resolved the way the web diary and the server
 * resolve them (web `bookingProcessingBlocksForLayout`, 2026-09-05):
 *
 *   1. the snapshot stored on the booking when it was made wins, EVEN WHEN
 *      EMPTY (a booking whose gap was deliberately removed has none), and
 *   2. only a missing snapshot falls back to the service's own pattern, or the
 *      chosen option's when that defines one.
 *
 * `GET /api/venue/calendar-grid` rows carry the snapshot and the service and
 * variant ids since web #178; an older backend sends none, and every booking
 * then reads as gap-free, which is what the grid drew before.
 */

/**
 * What a pattern source must offer: the service's own blocks and its options',
 * each with the catalogue length the pattern was drawn against (web #185: a
 * wait after the service moves with the end, so a booking of another length
 * has the template re-fitted to its own span). Lengths are optional; without
 * them the pattern is used as it is.
 */
export interface ProcessingPatternSource {
  processing_time_blocks?: ProcessingTimeBlock[] | null;
  duration_minutes?: number | null;
  /** Turnover after the service (and after any processing that runs past it); drawn as the buffer band. */
  buffer_minutes?: number | null;
  variants?:
    | readonly {
        id: string;
        processing_time_blocks?: ProcessingTimeBlock[] | null;
        duration_minutes?: number | null;
        buffer_minutes?: number | null;
      }[]
    | null;
}

/** Finds a service's pattern by id; undefined when the service is not known. */
export type ProcessingPatternLookup = (serviceId: string) => ProcessingPatternSource | undefined;

type BookingProcessingFields = Pick<
  CalendarGridBooking,
  'appointment_service_id' | 'service_item_id' | 'service_variant_id' | 'processing_time_blocks'
>;

/** The service a booking is for: the unified catalogue item first, then the legacy service. */
export function bookingServiceId(booking: BookingProcessingFields): string | null {
  return booking.service_item_id ?? booking.appointment_service_id ?? null;
}

/**
 * The blocks that apply to one booking, in minutes from its start (precedence
 * above). `bookingDurationMinutes` is the booking's own span: a booking with no
 * snapshot takes the catalogue pattern re-fitted from the catalogue length to
 * that span (web `bookingTemplateProcessingBlocks`, #185), so a wait after the
 * service follows the booking's real end. Omitted, or with no catalogue length
 * to fit from, the pattern is used as it is.
 */
export function bookingProcessingBlocks(
  booking: BookingProcessingFields,
  lookup: ProcessingPatternLookup | null | undefined,
  bookingDurationMinutes?: number | null,
): ProcessingTimeBlock[] {
  const snapshot = booking.processing_time_blocks;
  if (snapshot !== null && snapshot !== undefined) return parseProcessingTimeBlocks(snapshot);
  const serviceId = bookingServiceId(booking);
  if (!serviceId || !lookup) return [];
  const service = lookup(serviceId);
  if (!service) return [];
  const variantId = booking.service_variant_id;
  const variant = variantId ? service.variants?.find((v) => v.id === variantId) : undefined;
  const templateDuration = variant?.duration_minutes ?? service.duration_minutes ?? null;
  const template = effectiveProcessingTemplate({
    parentBlocks: service.processing_time_blocks ?? [],
    variantBlocks: variant?.processing_time_blocks,
    parentDurationMinutes: service.duration_minutes,
    variantDurationMinutes: templateDuration,
  });
  if (
    bookingDurationMinutes == null ||
    templateDuration == null ||
    templateDuration === bookingDurationMinutes ||
    template.length === 0
  ) {
    return template;
  }
  return fitProcessingBlocksToDuration(template, {
    fromDurationMinutes: templateDuration,
    toDurationMinutes: bookingDurationMinutes,
  }).blocks;
}

function mergeRanges(ranges: MinuteRange[]): MinuteRange[] {
  const sorted = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: MinuteRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/**
 * The wall-clock free ranges of a booking that starts at `startMin`: each
 * block from the booking's start, merged and sorted. NOT clamped to `endMin`
 * (web #185): a block that runs past the booking's end is a wait the
 * practitioner is free for, which another booking may share the lane in. The
 * drag guard clips to the span itself (`occupiedRangesMinusGaps`).
 */
export function processingGapRanges(
  startMin: number,
  _endMin: number,
  blocks: readonly ProcessingTimeBlock[],
): MinuteRange[] {
  return mergeRanges(
    blocks.map((b) => ({
      start: Math.max(startMin, startMin + b.start_minute),
      end: startMin + b.start_minute + b.duration_minutes,
    })),
  );
}

/** A booking's wall-clock span as the grids read it, with the same default for a missing end. */
function bookingSpan(
  booking: Pick<CalendarGridBooking, 'startTime' | 'endTime'>,
  defaultDurationMinutes: number,
): MinuteRange {
  const start = timeToMinutes(booking.startTime);
  let end = booking.endTime ? timeToMinutes(booking.endTime) : start + defaultDurationMinutes;
  if (end <= start) end = start + defaultDurationMinutes;
  return { start, end };
}

/**
 * A bar's gaps: for a visit, the union over its segments, each against its own
 * start. Another booking may nest into any of them.
 */
export function clusterProcessingGaps(
  bookings: readonly CalendarGridBooking[],
  lookup: ProcessingPatternLookup | null | undefined,
  defaultDurationMinutes: number,
): MinuteRange[] {
  const ranges: MinuteRange[] = [];
  for (const booking of bookings) {
    const { start, end } = bookingSpan(booking, defaultDurationMinutes);
    ranges.push(
      ...processingGapRanges(start, end, bookingProcessingBlocks(booking, lookup, end - start)),
    );
  }
  return mergeRanges(ranges);
}

/**
 * The minutes a booking actually holds for the drag conflict check: its span
 * minus its gaps, each piece under the booking's id so the check still excludes
 * the bar being moved. The server accepts a booking inside another's gap, so
 * the guard must not refuse a drop the server would take.
 */
export function occupiedRangesMinusGaps(
  id: string,
  startMin: number,
  endMin: number,
  gaps: readonly MinuteRange[],
): { id: string; start: number; end: number }[] {
  const out: { id: string; start: number; end: number }[] = [];
  let cursor = startMin;
  for (const gap of [...gaps].sort((a, b) => a.start - b.start)) {
    if (gap.end <= cursor || gap.start >= endMin) continue;
    if (gap.start > cursor) out.push({ id, start: cursor, end: gap.start });
    cursor = Math.max(cursor, gap.end);
  }
  if (cursor < endMin) out.push({ id, start: cursor, end: endMin });
  return out;
}

/**
 * The turnover after one booking: the chosen option's buffer, else the
 * service's, from the pattern lookup (the grid feed carries none). 0 when the
 * service is not known.
 */
export function bookingBufferMinutes(
  booking: BookingProcessingFields,
  lookup: ProcessingPatternLookup | null | undefined,
): number {
  const serviceId = bookingServiceId(booking);
  if (!serviceId || !lookup) return 0;
  const service = lookup(serviceId);
  if (!service) return 0;
  const variantId = booking.service_variant_id;
  const variant = variantId ? service.variants?.find((v) => v.id === variantId) : undefined;
  return Math.max(0, variant?.buffer_minutes ?? service.buffer_minutes ?? 0);
}

/**
 * A booking's free time, split the way the diary treats it (web #185):
 * `middle` bands sit before the practitioner's last busy stretch; the stretch
 * from `activeEnd` to the booking's end is not painted at all (the
 * practitioner is free for good from there); `tailMinutes` runs on past the
 * booking's end, and the buffer follows it. Wall-clock minutes.
 */
export interface BookingFreeRegions {
  start: number;
  end: number;
  /** Where the practitioner's last busy stretch ends; `end` when nothing reaches it. */
  activeEnd: number;
  /** Free bands inside the busy part of the booking. */
  middle: MinuteRange[];
  /** Processing that runs past `end`. */
  tailMinutes: number;
}

export function bookingFreeRegions(
  booking: BookingProcessingFields,
  lookup: ProcessingPatternLookup | null | undefined,
  start: number,
  end: number,
): BookingFreeRegions {
  const core = Math.max(0, end - start);
  const blocks = bookingProcessingBlocks(booking, lookup, core);
  const activeEnd = start + processingActiveEndMinutes(blocks, core);
  const middle = mergeRanges(
    blocks
      .map((b) => ({
        start: start + b.start_minute,
        end: Math.min(activeEnd, start + b.start_minute + b.duration_minutes),
      }))
      .filter((r) => r.end > r.start && r.start < activeEnd),
  );
  return { start, end, activeEnd, middle, tailMinutes: processingTailMinutes(blocks, core) };
}

/**
 * What a bar paints and what it leaves open, for one visit's cluster.
 *
 * - `holes`: wall-clock stretches inside the bar that are NOT painted, so the
 *   grid shows through: each segment's middle gaps, its trailing free stretch
 *   (from its active end to its end), and the whole wait between two segments
 *   (the tail, then the buffer).
 * - `freeTaps`: the parts of those holes a tap should treat as empty grid and
 *   book someone else into: middle gaps, trailing stretches, and the WAIT part
 *   of an inter-segment gap (never the buffer, which nothing can be booked in).
 * - `bufferBands`: each segment's turnover, from its end plus its tail.
 */
export interface ClusterPaintRegions {
  holes: MinuteRange[];
  freeTaps: MinuteRange[];
  bufferBands: MinuteRange[];
}

export function clusterPaintRegions(
  bookings: readonly CalendarGridBooking[],
  lookup: ProcessingPatternLookup | null | undefined,
  defaultDurationMinutes: number,
): ClusterPaintRegions {
  const segments = bookings
    .map((booking) => ({ booking, ...bookingSpan(booking, defaultDurationMinutes) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const holes: MinuteRange[] = [];
  const freeTaps: MinuteRange[] = [];
  const bufferBands: MinuteRange[] = [];
  segments.forEach((seg, index) => {
    const free = bookingFreeRegions(seg.booking, lookup, seg.start, seg.end);
    holes.push(...free.middle);
    freeTaps.push(...free.middle);
    if (free.activeEnd < seg.end) {
      holes.push({ start: free.activeEnd, end: seg.end });
      freeTaps.push({ start: free.activeEnd, end: seg.end });
    }
    const next = segments[index + 1];
    if (next && next.start > seg.end) {
      holes.push({ start: seg.end, end: next.start });
      const wait = Math.min(next.start - seg.end, free.tailMinutes);
      if (wait > 0) freeTaps.push({ start: seg.end, end: seg.end + wait });
    }
    if (seg.booking.status !== 'Cancelled' && seg.booking.status !== 'No-Show') {
      const buffer = bookingBufferMinutes(seg.booking, lookup);
      if (buffer > 0) {
        const bandStart = seg.end + free.tailMinutes;
        bufferBands.push({ start: bandStart, end: bandStart + buffer });
      }
    }
  });
  return { holes: mergeRanges(holes), freeTaps: mergeRanges(freeTaps), bufferBands };
}

/** The venue's own services, from `GET /api/venue/appointment-services`. */
export function patternLookupFromManagedServices(
  services: readonly ManagedService[] | null | undefined,
): ProcessingPatternLookup | null {
  if (!services || services.length === 0) return null;
  const byId = new Map<string, ProcessingPatternSource>();
  for (const service of services) {
    byId.set(service.id, {
      processing_time_blocks: service.processing_time_blocks ?? null,
      duration_minutes: service.duration_minutes ?? null,
      buffer_minutes: service.buffer_minutes ?? null,
      variants: (service.variants ?? []).map((v) => ({
        id: v.id,
        processing_time_blocks: v.processing_time_blocks ?? null,
        duration_minutes: v.duration_minutes ?? null,
        buffer_minutes: v.buffer_minutes ?? null,
      })),
    });
  }
  return (serviceId) => byId.get(serviceId);
}

/**
 * A linked venue's services as the linked-calendar feed shares them (web #176:
 * every service with its pattern and its options' patterns). A linked booking
 * carries no snapshot, so this is the only source for a partner column.
 */
export function patternLookupFromLinkedServices(
  services: readonly LinkedService[] | null | undefined,
): ProcessingPatternLookup | null {
  if (!services || services.length === 0) return null;
  const byId = new Map<string, ProcessingPatternSource>();
  for (const service of services) {
    byId.set(service.id, {
      processing_time_blocks: parseProcessingTimeBlocks(service.processingTimeBlocks),
      duration_minutes: service.durationMinutes ?? null,
      buffer_minutes: service.bufferMinutes ?? null,
      // The linked feed shares no per-option length, so an option inheriting
      // the parent's pattern reads it at the parent's length.
      variants: (service.variants ?? []).map((v) => ({
        id: v.id,
        processing_time_blocks: parseProcessingTimeBlocks(v.processingTimeBlocks),
      })),
    });
  }
  return (serviceId) => byId.get(serviceId);
}
