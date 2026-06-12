import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingListRow } from '@/types/booking-list';

// ---------------------------------------------------------------------------
// Query keys — defined locally (keys.ts is shared and frozen for this feature).
// Both keys nest under queryKeys.bookings.all() on purpose: every existing
// booking mutation (status change, reschedule, delete in BookingDetailSheet)
// already invalidates that prefix, so the roster and the session booked-counts
// refresh automatically after staff act on an attendee's booking.
// ---------------------------------------------------------------------------
export const classScheduleKeys = {
  sessions: (accessToken?: string | null, from?: string | null, to?: string | null) =>
    [
      ...queryKeys.bookings.all(),
      'classSessions',
      accessToken ?? null,
      from ?? null,
      to ?? null,
    ] as const,
  roster: (accessToken?: string | null, classInstanceId?: string | null) =>
    [
      ...queryKeys.bookings.all(),
      'classRoster',
      accessToken ?? null,
      classInstanceId ?? null,
    ] as const,
};

// ---------------------------------------------------------------------------
// GET /api/venue/schedule — Bearer-capable (createVenueRouteClient) merged
// schedule feed. Class sessions arrive as `kind: 'class_session'` blocks:
// one `ci-*` block per session with no bookings, and one `bk-*` block PER
// BOOKING for sessions that have bookings (the web calendar dedupes the same
// way). The dedicated class routes (/api/venue/classes,
// /api/venue/class-instances/*) are cookie-only, so this feed is the mobile
// source of truth for the timetable.
// ---------------------------------------------------------------------------

/** Subset of the ScheduleBlockDTO returned by GET /api/venue/schedule. */
interface ScheduleBlock {
  id: string;
  kind: 'event_ticket' | 'class_session' | 'resource_booking';
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  start_time: string;
  /** HH:mm */
  end_time: string;
  /** Class name for class_session blocks. */
  title: string;
  subtitle?: string | null;
  booking_id?: string | null;
  class_instance_id?: string | null;
  /** Status of the underlying booking — only present on `bk-*` blocks. */
  status?: string | null;
  /** Class type colour (hex). */
  accent_colour?: string | null;
  class_capacity?: number | null;
  class_booked_spots?: number | null;
  /** Instructor's unified calendar column. */
  calendar_id?: string | null;
}

interface ScheduleResponse {
  blocks: ScheduleBlock[];
}

/** One class session (a class_instance) after deduping schedule blocks. */
export interface ClassSession {
  classInstanceId: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  /** Class type name. */
  name: string;
  /** Class type colour (hex) — fall back to the brand colour when null. */
  accentColour: string | null;
  /** Instructor calendar column id (resolve to a name via usePractitioners). */
  calendarId: string | null;
  capacity: number | null;
  bookedSpots: number;
}

/**
 * Collapses the per-booking blocks the feed emits into one entry per class
 * instance. Blocks from cancelled bookings carry `class_booked_spots: null`,
 * so we keep the block with the richest booked-count for each instance.
 */
export function dedupeClassSessions(blocks: ScheduleBlock[]): ClassSession[] {
  const byInstance = new Map<string, ScheduleBlock>();
  for (const block of blocks) {
    if (block.kind !== 'class_session' || !block.class_instance_id) continue;
    const existing = byInstance.get(block.class_instance_id);
    const score = block.class_booked_spots ?? -1;
    const existingScore = existing ? (existing.class_booked_spots ?? -1) : -2;
    if (!existing || score > existingScore) {
      byInstance.set(block.class_instance_id, block);
    }
  }

  const sessions = [...byInstance.values()].map((block) => ({
    classInstanceId: block.class_instance_id as string,
    date: block.date,
    startTime: block.start_time,
    endTime: block.end_time,
    name: block.title,
    accentColour: block.accent_colour ?? null,
    calendarId: block.calendar_id ?? null,
    capacity: block.class_capacity ?? null,
    bookedSpots: block.class_booked_spots ?? 0,
  }));

  sessions.sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
  );
  return sessions;
}

type UseClassSessionsOptions = {
  /** Inclusive range start (YYYY-MM-DD). */
  from: string;
  /** Inclusive range end (YYYY-MM-DD). */
  to: string;
  enabled?: boolean;
};

/**
 * Upcoming class sessions for a date range, derived from the Bearer-capable
 * GET /api/venue/schedule feed. Returns an empty list for venues without the
 * class_session booking model (the route short-circuits to `{ blocks: [] }`).
 */
export function useClassSessions(options: UseClassSessionsOptions) {
  const accessToken = useAccessToken();
  const { from, to } = options;
  const queryEnabled =
    (options.enabled ?? true) && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: classScheduleKeys.sessions(accessToken, from, to),
    enabled: queryEnabled,
    queryFn: async (): Promise<ClassSession[]> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({ from, to });
      const data = await apiFetch<ScheduleResponse>(`/api/venue/schedule?${params}`, {
        accessToken,
      });
      return dedupeClassSessions(data.blocks ?? []);
    },
  });
}

// ---------------------------------------------------------------------------
// Session roster — GET /api/venue/bookings/list?class_instance_id=<uuid>
// (Bearer-capable). The web's dedicated roster route
// (/api/venue/class-instances/[id]/attendees) is cookie-only, but this list
// returns the same bookings with guest name/contact, status, party size and
// deposit fields.
// ---------------------------------------------------------------------------

/**
 * Roster row — the shared {@link BookingListRow} plus `checked_in_at`, which
 * the bookings/list payload returns for class attendees (the class check-in
 * timestamp, distinct from `client_arrived_at`). The shared type in
 * types/booking-list.ts is frozen during the parity push, so we widen it here.
 */
export type ClassRosterRow = BookingListRow & {
  /** ISO timestamp the attendee was checked in for the class, if at all. */
  checked_in_at?: string | null;
};

interface RosterResponse {
  bookings: ClassRosterRow[];
}

/** All bookings (attendees) for one class session, soonest booked first. */
export function useClassRoster(classInstanceId: string | null) {
  const accessToken = useAccessToken();
  const queryEnabled =
    isBackendConfigured() && accessToken !== null && classInstanceId !== null;

  return useQuery({
    queryKey: classScheduleKeys.roster(accessToken, classInstanceId),
    enabled: queryEnabled,
    queryFn: async (): Promise<RosterResponse> => {
      if (!accessToken || !classInstanceId) {
        throw new Error('Missing access token or class instance');
      }
      const params = new URLSearchParams({ class_instance_id: classInstanceId });
      return apiFetch<RosterResponse>(`/api/venue/bookings/list?${params}`, {
        accessToken,
      });
    },
  });
}
