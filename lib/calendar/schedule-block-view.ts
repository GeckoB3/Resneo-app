/**
 * Pure mappers that turn raw {@link ScheduleBlockDTO}s (classes / ticketed
 * events / resource bookings from the venue schedule feed) into render-ready
 * {@link CalendarScheduleBlock}s for the calendar grids.
 *
 * Shared by the main Calendar tab and the linked-venue calendar grid so both
 * render classes/events identically (colour, capacity line, class dedupe).
 */
import type { CalendarScheduleBlock, ScheduleBlockDTO } from '@/types/schedule-blocks';

/** Default accent per kind when the DTO carries no `accent_colour`. */
export const KIND_ACCENT: Record<ScheduleBlockDTO['kind'], string> = {
  class_session: '#22C55E', // green
  event_ticket: '#F59E0B', // amber
  resource_booking: '#64748B', // slate
};

/** Kind-specific capacity / uptake line (null when not applicable). */
export function capacityLabelFor(dto: ScheduleBlockDTO): string | null {
  if (dto.kind === 'class_session') {
    return dto.class_capacity != null
      ? `${dto.class_booked_spots ?? 0}/${dto.class_capacity} booked`
      : null;
  }
  if (dto.kind === 'event_ticket') {
    if (dto.event_capacity != null) {
      return `${dto.event_party_total ?? dto.event_booking_count ?? 0}/${dto.event_capacity}`;
    }
    return dto.event_booking_count != null ? `${dto.event_booking_count} booked` : null;
  }
  // resource_booking
  return dto.subtitle ?? null;
}

/** Normalize a raw DTO into the render-ready overlay block. */
export function toCalendarScheduleBlock(dto: ScheduleBlockDTO): CalendarScheduleBlock {
  return {
    id: dto.id,
    kind: dto.kind,
    startTime: dto.start_time,
    endTime: dto.end_time,
    title: dto.title,
    subtitle: dto.subtitle ?? null,
    accent: dto.accent_colour || KIND_ACCENT[dto.kind],
    capacityLabel: capacityLabelFor(dto),
  };
}

/**
 * Collapse the feed to one block per class_instance (richest booked-count wins,
 * mirroring useClassSchedule.dedupeClassSessions) so a busy class doesn't stack
 * N identical overlays. Events/resources pass through untouched.
 */
export function dedupeScheduleDTOs(blocks: ScheduleBlockDTO[]): ScheduleBlockDTO[] {
  const classByInstance = new Map<string, ScheduleBlockDTO>();
  const passthrough: ScheduleBlockDTO[] = [];
  for (const block of blocks) {
    if (block.kind === 'class_session' && block.class_instance_id) {
      const existing = classByInstance.get(block.class_instance_id);
      const score = block.class_booked_spots ?? -1;
      const existingScore = existing ? existing.class_booked_spots ?? -1 : -2;
      if (!existing || score > existingScore) {
        classByInstance.set(block.class_instance_id, block);
      }
    } else {
      passthrough.push(block);
    }
  }
  return [...classByInstance.values(), ...passthrough];
}
