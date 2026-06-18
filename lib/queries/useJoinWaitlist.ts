import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';

/**
 * Input to {@link useJoinWaitlist}. Mirrors the web `joinSchema` in
 * `C:\Resneo/src/app/api/booking/appointment-waitlist/route.ts`.
 *
 * - `all_day` (the default when `preferred_window` is omitted) sends no times.
 * - `time_range` REQUIRES both `desired_time` and `desired_time_end` (HH:mm);
 *   the backend's `validateGuestWaitlistTimeInput` rejects a half-filled range
 *   and requires end > start.
 * - `notes` is optional, max 500 chars server-side.
 */
export interface JoinWaitlistInput {
  venue_id: string;
  service_id: string;
  desired_date: string;
  practitioner_id?: string;
  first_name: string;
  last_name: string;
  guest_email: string;
  guest_phone: string;
  /** Defaults to 'all_day' when omitted. */
  preferred_window?: 'all_day' | 'time_range';
  /** HH:mm — only sent (and required) when preferred_window === 'time_range'. */
  desired_time?: string;
  /** HH:mm — only sent (and required) when preferred_window === 'time_range'. */
  desired_time_end?: string;
  /** Optional free-text note (max 500 chars). */
  notes?: string;
}

/**
 * Build the POST body for /api/booking/appointment-waitlist, sending only the
 * fields the backend expects for the chosen window so an `all_day` request never
 * trips the "Do not send times when preferred_window is all_day" guard, and a
 * `time_range` request always carries both times. Exported for unit testing.
 */
export function buildJoinWaitlistBody(input: JoinWaitlistInput): Record<string, unknown> {
  const {
    preferred_window = 'all_day',
    desired_time,
    desired_time_end,
    notes,
    practitioner_id,
    ...rest
  } = input;

  const body: Record<string, unknown> = { ...rest, preferred_window };

  if (practitioner_id) {
    body.practitioner_id = practitioner_id;
  }

  if (preferred_window === 'time_range') {
    if (desired_time) body.desired_time = desired_time;
    if (desired_time_end) body.desired_time_end = desired_time_end;
  }

  const trimmedNotes = notes?.trim();
  if (trimmedNotes) {
    body.notes = trimmedNotes;
  }

  return body;
}

/**
 * POST /api/booking/appointment-waitlist — add a guest to the appointment
 * waitlist when no slots fit (public route; venue-scoped by venue_id).
 */
export function useJoinWaitlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: JoinWaitlistInput): Promise<unknown> => {
      return apiFetch<unknown>('/api/booking/appointment-waitlist', {
        method: 'POST',
        body: JSON.stringify(buildJoinWaitlistBody(input)),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all() });
    },
  });
}
