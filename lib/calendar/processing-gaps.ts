import { timeToMinutes } from '@/components/calendar/grid-layout';
import {
  effectiveProcessingTemplate,
  parseProcessingTimeBlocks,
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

/** What a pattern source must offer: the service's own blocks and its options'. */
export interface ProcessingPatternSource {
  processing_time_blocks?: ProcessingTimeBlock[] | null;
  variants?: readonly { id: string; processing_time_blocks?: ProcessingTimeBlock[] | null }[] | null;
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

/** The blocks that apply to one booking, in minutes from its start (precedence above). */
export function bookingProcessingBlocks(
  booking: BookingProcessingFields,
  lookup: ProcessingPatternLookup | null | undefined,
): ProcessingTimeBlock[] {
  const snapshot = booking.processing_time_blocks;
  if (snapshot !== null && snapshot !== undefined) return parseProcessingTimeBlocks(snapshot);
  const serviceId = bookingServiceId(booking);
  if (!serviceId || !lookup) return [];
  const service = lookup(serviceId);
  if (!service) return [];
  const variantId = booking.service_variant_id;
  const variant = variantId ? service.variants?.find((v) => v.id === variantId) : undefined;
  return effectiveProcessingTemplate({
    parentBlocks: service.processing_time_blocks ?? [],
    variantBlocks: variant?.processing_time_blocks,
  });
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
 * The wall-clock free ranges inside a booking that runs `startMin` to `endMin`:
 * each block clipped to the booking, merged and sorted. A block that starts at
 * or after the booking's end is dropped.
 */
export function processingGapRanges(
  startMin: number,
  endMin: number,
  blocks: readonly ProcessingTimeBlock[],
): MinuteRange[] {
  return mergeRanges(
    blocks.map((b) => ({
      start: Math.max(startMin, startMin + b.start_minute),
      end: Math.min(endMin, startMin + b.start_minute + b.duration_minutes),
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
    ranges.push(...processingGapRanges(start, end, bookingProcessingBlocks(booking, lookup)));
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

/** The venue's own services, from `GET /api/venue/appointment-services`. */
export function patternLookupFromManagedServices(
  services: readonly ManagedService[] | null | undefined,
): ProcessingPatternLookup | null {
  if (!services || services.length === 0) return null;
  const byId = new Map<string, ProcessingPatternSource>();
  for (const service of services) {
    byId.set(service.id, {
      processing_time_blocks: service.processing_time_blocks ?? null,
      variants: (service.variants ?? []).map((v) => ({
        id: v.id,
        processing_time_blocks: v.processing_time_blocks ?? null,
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
      variants: (service.variants ?? []).map((v) => ({
        id: v.id,
        processing_time_blocks: parseProcessingTimeBlocks(v.processingTimeBlocks),
      })),
    });
  }
  return (serviceId) => byId.get(serviceId);
}
