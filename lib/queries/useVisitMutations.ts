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
  /**
   * Move the WHOLE visit (web #187): every scheduled service moves by the same
   * amount as the earliest one, keeping the gaps between them. A calendar given
   * here applies to every service. `{}` is allowed and describes the visit as it
   * stands, which is how a dry run learns the layout before anything is edited.
   *
   * Exactly one of `shift` and `services` must be sent; the endpoint refuses a
   * body with both or neither. Build the body with
   * `lib/booking/visit-schedule-request.ts` rather than by hand.
   */
  shift?: VisitScheduleShiftInput;
  /**
   * Change named services only. Each takes exactly the date, start, calendar
   * and length asked for; a service not named is left where it is, and
   * shortening one no longer pulls the next forward.
   */
  services?: VisitScheduleServiceInput[];
  /**
   * Every scheduled row of the visit as the caller last saw it. Optional here
   * (this route never removes a row) but sent with every `services` write: an
   * edit planned against three services must not land on a visit that has since
   * gained a fourth nobody on that screen has seen. Mismatched → 412
   * `{ code: 'stale_visit' }`.
   */
  known_booking_ids?: string[];
  allow_manual_overlap?: boolean;
  allow_outside_hours?: boolean;
  /**
   * Staff placement over a break. A DISTINCT gate from `allow_outside_hours`,
   * which has never relaxed the engine's break check — the visit dry run and
   * the save must both send it or they disagree and the visit is refused before
   * anything is written (R17-3).
   */
  allow_during_breaks?: boolean;
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

export interface VisitScheduleShiftInput {
  /** YYYY-MM-DD */
  booking_date?: string;
  /** HH:mm:ss */
  booking_time?: string;
  /** Target calendar (unified `calendar_id`, legacy `practitioner_id`). */
  practitioner_id?: string;
}

export interface VisitScheduleServiceInput {
  booking_id: string;
  booking_date?: string;
  /** HH:mm:ss */
  booking_time?: string;
  practitioner_id?: string;
  /** 5..840 */
  duration_minutes?: number;
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
  calendar_id?: string | null;
  moved: boolean;
  /** Whether this request changes the row (false on a `shift: {}` dry run). */
  changed?: boolean;
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
  /** The day the visit's last service ends on; differs from `booking_date` when the services span days. */
  end_date?: string;
  total_minutes: number;
  calendar_id: string;
  /** The hours override is what lets a changed service sit where it is going. */
  outside_hours?: boolean;
  /** False when the request asks for the shape the visit already has. */
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

/** One line of the visit as the staff member wants it, in order. */
export interface VisitServiceLineInput {
  /**
   * The row this line keeps. Absent adds a service; a line whose `service_id`
   * differs from the row's re-services it (a swap).
   */
  booking_id?: string | null;
  service_id: string;
  service_variant_id?: string | null;
}

export interface VisitServicesPatchInput {
  /**
   * The visit's services, in order. This is DECLARATIVE: a row of the visit left
   * out of the list is removed from it, so the list must always be the whole
   * visit.
   */
  services: VisitServiceLineInput[];
  /**
   * Every scheduled row of the visit as the caller last saw it.
   *
   * Required, and the reason is the line above: omission removes. A form opened
   * on three services that saves after a fourth appeared would cancel that fourth
   * without ever having shown it, and the per-row guards cannot catch that — the
   * row nobody knew about is exactly the one being dropped. Mismatched, the whole
   * request is refused with 412 rather than applied.
   */
  known_booking_ids: string[];
  /** The visit's schedule, when the same edit moves it. */
  booking_date?: string;
  booking_time?: string;
  practitioner_id?: string;
  allow_manual_overlap?: boolean;
  allow_outside_hours?: boolean;
  /** See the schedule payload above — a separate gate from out-of-hours (R17-3). */
  allow_during_breaks?: boolean;
  dry_run?: boolean;
  defer_modification_guest_notification?: boolean;
  skip_booking_modification_guest_notification?: boolean;
}

/** What each line becomes, and whether it was kept, added or re-serviced. */
export interface VisitPlannedServiceLine {
  id: string | null;
  kind: 'keep' | 'add' | 'reservice';
  service_id: string;
  service_variant_id: string | null;
  name: string | null;
  booking_date: string;
  booking_time: string;
  booking_end_time: string;
  duration_minutes: number;
}

export interface VisitServicesPlan {
  ok: true;
  group_booking_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  total_minutes: number;
  changed: boolean;
  dry_run: boolean;
  /** Rows this edit will cancel. Cancelled, not deleted — they keep their history. */
  removed_booking_ids: string[];
  services: VisitPlannedServiceLine[];
}

/**
 * PATCH /api/venue/visits/[groupBookingId]/services — add, remove, swap or
 * reorder the services of a visit, and move it in the same write.
 *
 * Three refusals worth knowing before wiring a caller to it: an empty list is
 * refused in words ("a visit has to keep at least one service; to end the
 * booking altogether, cancel it instead"), a stale view is refused with 412, and
 * a row with money against it cannot be removed at all — refunds belong to
 * cancellation, which has its own rules.
 */
export function useVisitServices(groupBookingId: string | null | undefined) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: VisitServicesPatchInput): Promise<VisitServicesPlan> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      if (!groupBookingId) {
        throw new Error('Missing visit id');
      }
      return apiFetch<VisitServicesPlan>(
        `/api/venue/visits/${encodeURIComponent(groupBookingId)}/services`,
        { accessToken, method: 'PATCH', body: JSON.stringify(input) },
      );
    },
    onSuccess: (data, input) => {
      if (input.dry_run === true) return;
      const anyServiceId = data.services?.find((s) => s.id)?.id;
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
