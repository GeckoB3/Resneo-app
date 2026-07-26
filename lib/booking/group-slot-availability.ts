/**
 * Group bookings: keep attendees off each other's time.
 *
 * The people in a group are only created when the whole group is submitted, so
 * the server's availability engine cannot know about them while the staff
 * member is still building the group — every attendee is offered the SAME free
 * slots, and nothing stops two of them being booked onto one practitioner at
 * one time. The clash only surfaces on submit, or worse, not at all.
 *
 * These helpers close that gap on the client, which is the only place the
 * pending attendees exist. They are pure so the arithmetic can be tested
 * directly rather than through the wizard.
 */

import { minutesToTime, timeToMinutes } from '@/lib/booking/booking-format';
import type { GroupPerson } from '@/lib/booking/multi-service-chain';

/** A practitioner's time already claimed by an attendee added earlier. */
export interface GroupBusyInterval {
  practitionerId: string;
  /** Minutes since midnight. */
  startMinutes: number;
  endMinutes: number;
}

/**
 * Time already taken on `date` by the attendees added so far.
 *
 * Scoped per practitioner: two attendees CAN share a time when different staff
 * are seeing them, which is the normal shape of a group booking.
 */
export function groupBusyIntervals(people: GroupPerson[], date: string): GroupBusyInterval[] {
  const out: GroupBusyInterval[] = [];
  for (const p of people) {
    if (p.bookingDate !== date) continue;
    const start = timeToMinutes(p.bookingTime.slice(0, 5));
    if (!Number.isFinite(start)) continue;
    out.push({
      practitionerId: p.practitionerId,
      startMinutes: start,
      endMinutes: start + Math.max(0, p.durationMinutes),
    });
  }
  return out;
}

/**
 * Would a slot starting at `startTime` for `durationMinutes` overlap time this
 * practitioner has already been given in the group?
 *
 * The candidate's OWN duration matters, not just its start: a 10:15 slot for a
 * 45 minute service still runs into a 10:00-10:30 booking.
 */
export function slotClashesWithGroup(
  slot: { start_time: string; practitioner_id?: string | null },
  durationMinutes: number,
  busy: GroupBusyInterval[],
): boolean {
  const practitionerId = slot.practitioner_id ?? null;
  if (!practitionerId) return false;
  const start = timeToMinutes(slot.start_time.slice(0, 5));
  if (!Number.isFinite(start)) return false;
  const end = start + Math.max(0, durationMinutes);
  return busy.some(
    (b) => b.practitionerId === practitionerId && start < b.endMinutes && end > b.startMinutes,
  );
}

/** Drop the slots that would double-book a practitioner already in this group. */
export function filterSlotsForGroup<T extends { start_time: string; practitioner_id?: string | null }>(
  slots: T[],
  durationMinutes: number,
  busy: GroupBusyInterval[],
): T[] {
  if (busy.length === 0) return slots;
  return slots.filter((s) => !slotClashesWithGroup(s, durationMinutes, busy));
}

/**
 * When this attendee is seeing a practitioner who is already booked in the
 * group, the time they should be offered first: right after that practitioner
 * finishes, so the group runs back to back instead of leaving an accidental gap.
 *
 * Returns "HH:mm", or null when this practitioner has nothing booked yet (or
 * the attendee is on "any available", where there is no one practitioner to
 * follow on from).
 */
export function earliestStartAfterGroup(
  busy: GroupBusyInterval[],
  practitionerId: string | null | undefined,
): string | null {
  if (!practitionerId) return null;
  const mine = busy.filter((b) => b.practitionerId === practitionerId);
  if (mine.length === 0) return null;
  return minutesToTime(Math.max(...mine.map((b) => b.endMinutes)));
}

/**
 * The slot to preselect: the first one at or after `earliestStart`. Falls back
 * to null when nothing qualifies, so the caller leaves the choice to staff
 * rather than selecting something misleading.
 */
export function pickSlotAtOrAfter<T extends { start_time: string }>(
  slots: T[],
  earliestStart: string | null,
): T | null {
  if (!earliestStart) return null;
  const threshold = timeToMinutes(earliestStart);
  if (!Number.isFinite(threshold)) return null;
  for (const s of slots) {
    const start = timeToMinutes(s.start_time.slice(0, 5));
    if (Number.isFinite(start) && start >= threshold) return s;
  }
  return null;
}
