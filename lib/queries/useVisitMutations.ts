import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { invalidateBookingCaches } from '@/lib/queries/useBookingMutations';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * A multi-service visit's schedule, written as ONE request.
 *
 * A visit is N rows sharing a `group_booking_id`, so moving it or changing its
 * length rewrites every one of them. Done as N client PATCHes, a refusal
 * part-way through leaves one service moved and the rest behind — which is
 * exactly how a visit ends up running 10:11 to 18:16. The endpoint plans every
 * service, checks each against the availability engine, writes them, and puts
 * back the rows that already landed if one fails.
 *
 * @see _reference/Resneo/src/app/api/venue/visits/[groupBookingId]/schedule/route.ts
 * @see Docs/APP_GAP_REPORT_R15_WEB_DELTA.md (R15-2)
 */
export interface VisitSchedulePatchInput {
  /** New date for the whole visit. */
  booking_date?: string;
  /** New start for the visit's FIRST service, HH:mm or HH:mm:ss; the rest follow. */
  booking_time?: string;
  /** Target calendar (unified `calendar_id`, legacy `practitioner_id`). */
  practitioner_id?: string;
  /**
   * New wall-clock span for the WHOLE visit, configured gaps included. The
   * server distributes it: growth extends the tail, shrinkage comes off the tail
   * and then cascades backwards, each service down to its own floor.
   */
  total_duration_minutes?: number;
  allow_manual_overlap?: boolean;
  allow_outside_hours?: boolean;
  /**
   * Plan and check without writing. Answers in the same shape the save does, so
   * a form's live check and its save cannot disagree.
   */
  dry_run?: boolean;
  /** Hold back the guest email so the app can prompt (Notify / Don't notify / Undo). */
  defer_modification_guest_notification?: boolean;
  /** Suppress it outright — used by Undo, where no prompt follows. */
  skip_booking_modification_guest_notification?: boolean;
}

/** One service of the visit, as the plan will lay it out. */
export interface VisitPlannedService {
  id: string;
  name: string | null;
  service_id: string | null;
  service_variant_id: string | null;
  booking_date: string;
  /** HH:mm:ss */
  booking_time: string;
  /** HH:mm:ss */
  booking_end_time: string;
  duration_minutes: number;
  moved: boolean;
}

/** What the endpoint says the save will do (or, on a dry run, would do). */
export interface VisitSchedulePlan {
  ok: true;
  group_booking_id: string;
  booking_date: string;
  /** HH:mm */
  start_time: string;
  /** HH:mm */
  end_time: string;
  total_minutes: number;
  calendar_id: string;
  /**
   * False when the request asks for the shape the visit already has. True on a
   * request that changes nothing but re-lays the visit, which is how dead time an
   * earlier per-service edit left behind gets closed.
   */
  changed: boolean;
  dry_run: boolean;
  services: VisitPlannedService[];
}

/**
 * PATCH /api/venue/visits/[groupBookingId]/schedule — move a visit, change its
 * wall-clock span, or both.
 *
 * A 409 carries a sentence naming the service and the time it could not take
 * ("Toner / Gloss cannot go to 11:45: …. The visit was not moved."), which is
 * surfaced verbatim: the caller has nothing better to say than the service that
 * blocked it.
 */
export function useVisitSchedule(groupBookingId: string | null | undefined) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: VisitSchedulePatchInput): Promise<VisitSchedulePlan> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      if (!groupBookingId) {
        throw new Error('Missing visit id');
      }
      return apiFetch<VisitSchedulePlan>(
        `/api/venue/visits/${encodeURIComponent(groupBookingId)}/schedule`,
        { accessToken, method: 'PATCH', body: JSON.stringify(input) },
      );
    },
    onSuccess: (data, input) => {
      // A dry run wrote nothing, so nothing is stale.
      if (input.dry_run === true) return;
      // One call covers the whole visit: `queryKeys.bookings.all()` is a prefix of
      // every booking's detail key AND of the group-visit query, so fanning out
      // per service would only repeat the same invalidations.
      const anyServiceId = data.services?.[0]?.id;
      if (anyServiceId) {
        invalidateBookingCaches(queryClient, accessToken, anyServiceId);
      }
    },
  });
}

/**
 * The same endpoint where the VISIT changes per action — the calendar's
 * drag-move, drag-resize and undo, which act on whichever bar was grabbed.
 *
 * A fixed-id hook would close over a stale visit there, the same reason
 * `useRescheduleBookingById` exists beside `useRescheduleBooking`.
 */
export function useVisitScheduleById() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: VisitSchedulePatchInput & { groupBookingId: string },
    ): Promise<VisitSchedulePlan> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const { groupBookingId, ...body } = input;
      return apiFetch<VisitSchedulePlan>(
        `/api/venue/visits/${encodeURIComponent(groupBookingId)}/schedule`,
        { accessToken, method: 'PATCH', body: JSON.stringify(body) },
      );
    },
    onSuccess: (data, input) => {
      if (input.dry_run === true) return;
      const anyServiceId = data.services?.[0]?.id;
      if (anyServiceId) {
        invalidateBookingCaches(queryClient, accessToken, anyServiceId);
      }
    },
  });
}
