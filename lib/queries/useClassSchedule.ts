import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

// ---------------------------------------------------------------------------
// Query keys — defined locally (keys.ts is shared and frozen for this feature).
// The sessions key nests under queryKeys.bookings.all() on purpose: every
// existing booking mutation (status change, reschedule, delete in
// BookingDetailSheet) already invalidates that prefix, so the session
// booked-counts refresh automatically after staff act on an attendee's booking.
// ---------------------------------------------------------------------------
export const classScheduleKeys = {
  sessions: (accessToken?: string | null, from?: string | null, to?: string | null) =>
    [
      ...queryKeys.bookings.all(),
      'classSessions',
      keyScope(accessToken),
      from ?? null,
      to ?? null,
    ] as const,
};

// ---------------------------------------------------------------------------
// GET /api/venue/schedule — Bearer-capable (createVenueRouteClient) merged
// schedule feed. Class sessions arrive as `kind: 'class_session'` blocks:
// one `ci-*` block per session with no bookings, and one `bk-*` block PER
// BOOKING for sessions that have bookings (the web calendar dedupes the same
// way). This feed is the mobile source of truth for the timetable; the
// per-session roster is loaded separately from the Bearer-capable
// /api/venue/class-instances/[id]/attendees route (see useClassInstanceAttendees
// in lib/queries/useClassesManage.ts).
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
