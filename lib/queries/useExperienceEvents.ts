import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingListRow, BookingsListResponse } from '@/types/booking-list';

/**
 * Local query keys for the events feature. lib/queries/keys.ts is frozen
 * during the parity push, so these mirror its `[...all, segment, token, …]`
 * shape under the shared 'reserveNI' root without touching the factory.
 */
export const experienceEventKeys = {
  all: ['reserveNI', 'experienceEvents'] as const,
  list: (accessToken?: string | null, from?: string | null, to?: string | null) =>
    [...experienceEventKeys.all, 'list', accessToken ?? null, from ?? null, to ?? null] as const,
  attendeesAll: () => [...experienceEventKeys.all, 'attendees'] as const,
  attendees: (accessToken?: string | null, eventId?: string | null) =>
    [...experienceEventKeys.attendeesAll(), accessToken ?? null, eventId ?? null] as const,
};

/**
 * Subset of a block from GET /api/venue/schedule (Bearer-capable).
 * The route emits one `kind: 'event_ticket'` block per active experience
 * event in range, with booking stats aggregated server-side.
 * @see _reference/Resneo/src/app/api/venue/schedule/route.ts
 */
interface ScheduleBlock {
  id: string;
  kind: 'event_ticket' | 'class_session' | 'resource_booking';
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  subtitle?: string | null;
  experience_event_id?: string | null;
  calendar_id?: string | null;
  event_capacity?: number | null;
  /** Non-cancelled bookings count for this event. */
  event_booking_count?: number | null;
  /** Sum of party_size (tickets sold) for those bookings. */
  event_party_total?: number | null;
  /** Non-cancelled bookings with client_arrived_at set. */
  event_arrived_count?: number | null;
}

interface ScheduleResponse {
  blocks: ScheduleBlock[];
}

/** One upcoming/past event row for the staff Events screen. */
export interface ExperienceEventSummary {
  /** experience_events.id — pass to the attendee roster query. */
  id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  startTime: string;
  /** HH:MM */
  endTime: string;
  capacity: number | null;
  /** Non-cancelled bookings for this event. */
  bookingCount: number;
  /** Tickets sold — sum of party_size across non-cancelled bookings. */
  ticketsSold: number;
  /** Bookings already marked arrived. */
  arrivedCount: number;
  calendarId: string | null;
}

function toEventSummary(block: ScheduleBlock): ExperienceEventSummary {
  return {
    id: block.experience_event_id as string,
    name: block.title,
    date: block.date,
    startTime: block.start_time,
    endTime: block.end_time,
    capacity: block.event_capacity ?? null,
    bookingCount: block.event_booking_count ?? 0,
    ticketsSold: block.event_party_total ?? 0,
    arrivedCount: block.event_arrived_count ?? 0,
    calendarId: block.calendar_id ?? null,
  };
}

type UseExperienceEventsOptions = {
  /** Inclusive range start (YYYY-MM-DD). */
  from: string;
  /** Inclusive range end (YYYY-MM-DD). */
  to: string;
  enabled?: boolean;
};

/**
 * Active ticketed events in a date range, with tickets sold / capacity /
 * arrived stats. Sourced from GET /api/venue/schedule (Bearer) — the
 * event-manager CRUD routes are cookie-only, so the app reads events from
 * the schedule feed instead. Sorted by date then start time, ascending.
 */
export function useExperienceEvents(options: UseExperienceEventsOptions) {
  const accessToken = useAccessToken();
  const { from, to } = options;
  const enabled = (options.enabled ?? true) && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: experienceEventKeys.list(accessToken, from, to),
    enabled,
    queryFn: async (): Promise<ExperienceEventSummary[]> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({ from, to });
      const data = await apiFetch<ScheduleResponse>(`/api/venue/schedule?${params}`, {
        accessToken,
      });
      return (data.blocks ?? [])
        .filter((b) => b.kind === 'event_ticket' && typeof b.experience_event_id === 'string')
        .map(toEventSummary)
        .sort((a, b) => {
          const dc = a.date.localeCompare(b.date);
          if (dc !== 0) return dc;
          return a.startTime.localeCompare(b.startTime);
        });
    },
  });
}

/**
 * Ticket-holder roster for one event — every booking row carrying this
 * experience_event_id, via GET /api/venue/bookings/list?experience_event_id=
 * (Bearer-capable; verified in the reference route).
 */
export function useEventAttendees(eventId: string | null) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && eventId !== null;

  return useQuery({
    queryKey: experienceEventKeys.attendees(accessToken, eventId),
    enabled,
    queryFn: async (): Promise<BookingListRow[]> => {
      if (!accessToken || !eventId) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({ experience_event_id: eventId });
      const data = await apiFetch<BookingsListResponse>(`/api/venue/bookings/list?${params}`, {
        accessToken,
      });
      return data.bookings ?? [];
    },
  });
}

/**
 * PATCH /api/venue/bookings/[id] { client_arrived } — the same Bearer route
 * the web event-manager uses for its attendee Arrived/Clear toggle. Variables
 * carry the bookingId so one mutation serves every row in the roster.
 * Invalidates the roster, the events list (arrived counts) and booking caches.
 */
export function useToggleAttendeeArrived() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { bookingId: string; arrived: boolean }): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(`/api/venue/bookings/${input.bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ client_arrived: input.arrived }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: experienceEventKeys.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
    },
  });
}
