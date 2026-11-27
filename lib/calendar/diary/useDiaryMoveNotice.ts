import { useCallback, useEffect, useRef, useState } from 'react';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { type RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { bookingModificationNotifyOutcome } from '@/lib/booking/modification-notify-result';
import { visitRestoreRequest } from '@/lib/booking/visit-schedule-request';
import {
  joinsPendingMoveNotice,
  lengthChangeToastMessage,
  mergeMoveNotice,
  type MoveNotice,
  type MoveNoticeInput,
} from '@/lib/calendar/move-notice';
import {
  useNotifyBookingModification,
  type useRescheduleBookingById,
} from '@/lib/queries/useBookingMutations';
import { type useVisitScheduleById } from '@/lib/queries/useVisitMutations';
import { type useToast } from '@/providers/ToastProvider';

export interface DiaryMoveNoticeInput {
  rescheduleById: ReturnType<typeof useRescheduleBookingById>;
  visitScheduleById: ReturnType<typeof useVisitScheduleById>;
  toast: ReturnType<typeof useToast>;
}

/**
 * The diary's prompt after a drag: notify the client, skip, or undo (a resize
 * gets a toast with Undo instead). Moved out of the diary screen unchanged
 * (codebase standards P5.2).
 */
export function useDiaryMoveNotice({ rescheduleById, visitScheduleById, toast }: DiaryMoveNoticeInput) {
  // Sends the deferred "booking changed" email when the user taps Notify.
  const notifyModification = useNotifyBookingModification();

  // After a drag move/resize, prompt to notify the guest (or undo) — the server
  // notification is deferred so the staff member chooses. Null when not showing.
  //
  // `startMoved` is false for a pure resize AND for a cross-column reassign at
  // the same time: in both the guest is still due when they were, so the notify
  // offer is withheld (the email was skipped outright at commit) and only Undo
  // is offered. `lengthChanged` says Undo has to put a length back; on a visit
  // re-asserting one is not free (see `undoReschedule`).
  //
  // Keyed by VISIT (split-visit plan G7): a change to another service of the
  // visit the open prompt stands for joins it, so the client gets one notice and
  // Undo puts back every service it covers. See `lib/calendar/move-notice.ts`.
  const [moveNotice, setMoveNotice] = useState<MoveNotice<RescheduleTarget> | null>(null);
  /** The prompt as it stands, for a commit that lands after the render that started it. */
  const moveNoticeRef = useRef<MoveNotice<RescheduleTarget> | null>(null);
  useEffect(() => {
    moveNoticeRef.current = moveNotice;
  }, [moveNotice]);

  // Restore a booking to its previous slot AND length. Sends the original end so
  // the revert validates the true span, and SKIPS the email: an undone change is
  // not something to tell the guest about, and there is no follow-up prompt
  // here to decide otherwise.
  const undoReschedule = useCallback(
    (previous: RescheduleTarget, _options: { restoreLength: boolean }) => {
      if (previous.visit) {
        /**
         * A visit goes back through the endpoint that moved it, so the undo is as
         * all-or-nothing as the move was.
         *
         * A plain move is undone by shifting the visit back. A resize changed
         * one service's length, and a shift cannot restore that, so every row is
         * named with the slot and length it had (web #187's `services` mode).
         */
        visitScheduleById.mutate({
          groupBookingId: previous.visit.groupBookingId,
          // The calendar only ever moved the rows it could see (one day of the
          // visit), so it puts back exactly those, each at the slot and length
          // it had. No known-rows guard: the grid cannot know the other days.
          ...visitRestoreRequest({
            services: previous.visit.services,
            date: previous.date,
            practitionerId: previous.practitionerId,
            guardKnownRows: false,
          }),
          allow_outside_hours: true,
          // A SEPARATE gate from the one above: the server's break check has
          // never been relaxed by `allow_outside_hours`, so without this a move
          // the grid permits comes back 409 "Conflicts with a break" (R17-3).
          allow_during_breaks: true,
          allow_manual_overlap: true,
          // Going back to where it was: an overlap it had then is not news (G13).
          acknowledge_visit_overlap: true,
          skip_booking_modification_guest_notification: true,
        });
        return;
      }
      const endTime =
        previous.durationMinutes != null
          ? `${minutesToTime(timeToMinutes(previous.time) + previous.durationMinutes)}:00`
          : undefined;
      rescheduleById.mutate({
        bookingId: previous.id,
        date: previous.date,
        time: `${previous.time.slice(0, 5)}:00`,
        ...(endTime ? { endTime } : {}),
        // A cross-column move's Undo must also return the booking to its ORIGINAL
        // column — restore the practitioner when one was captured (time-only moves
        // leave it undefined, keeping the current practitioner).
        ...(previous.practitionerId ? { practitionerId: previous.practitionerId } : {}),
        skipGuestNotification: true,
      });
    },
    [rescheduleById, visitScheduleById],
  );

  const closeMoveNotice = useCallback(() => {
    moveNoticeRef.current = null;
    setMoveNotice(null);
  }, []);

  /**
   * Announce a committed drag. A move (or a reassign) opens the notify sheet,
   * because the guest may need telling. A pure resize has nothing to ask: the
   * guest is due when they were and the server sent no email, so a sheet with
   * only Undo and Done just got in the way of the next drag. It gets a toast,
   * keeping Undo as its action.
   */
  const raiseChangeNotice = useCallback(
    (notice: MoveNoticeInput<RescheduleTarget>) => {
      const pending = moveNoticeRef.current;
      // A change to the visit the open prompt stands for joins it, a resize too,
      // so Undo there covers it and the client hears once (G7).
      if (notice.startMoved || notice.reassigned || joinsPendingMoveNotice(pending, notice)) {
        const next = mergeMoveNotice(pending, notice);
        moveNoticeRef.current = next;
        setMoveNotice(next);
        return;
      }
      const message = lengthChangeToastMessage(!!notice.previous.visit, notice.overlapNote);
      const undo = {
        actionLabel: 'Undo',
        onAction: () => undoReschedule(notice.previous, { restoreLength: notice.lengthChanged }),
      };
      if (notice.overlapNote) toast.info(message, { ...undo, duration: 7000 });
      else toast.success(message, undo);
    },
    [toast, undoReschedule],
  );

  const handleNotifyMove = useCallback(() => {
    if (!moveNotice) return;
    notifyModification.mutate(
      { bookingId: moveNotice.bookingId },
      {
        // The route answers 200 even when it sends nothing (notifications off,
        // no channel enabled, no contact details), so the toast reads the body
        // rather than claiming the guest was told (web parity).
        onSuccess: (result) => {
          const outcome = bookingModificationNotifyOutcome(result);
          if (outcome.sent) toast.success(outcome.message);
          else toast.info(outcome.message);
        },
        onError: () => toast.error('Could not notify the client.'),
      },
    );
    moveNoticeRef.current = null;
    setMoveNotice(null);
  }, [moveNotice, notifyModification, toast]);

  const handleUndoMove = useCallback(() => {
    if (!moveNotice) return;
    // Every service the prompt stands for goes back to where it was before its
    // first change (G7). Services of one visit go back in ONE request, so the
    // undo is as all-or-nothing as each move was.
    const { changes } = moveNotice;
    const head = changes[0]!.previous;
    const oneVisit =
      head.visit != null &&
      changes.every((c) => c.previous.visit?.groupBookingId === head.visit!.groupBookingId);
    if (changes.length > 1 && oneVisit) {
      undoReschedule(
        {
          ...head,
          // Each row carries its own calendar, so no one calendar is named for all.
          practitionerId: null,
          visit: { ...head.visit!, services: changes.flatMap((c) => c.previous.visit!.services) },
        },
        { restoreLength: changes.some((c) => c.lengthChanged) },
      );
    } else {
      for (const change of changes) {
        undoReschedule(change.previous, { restoreLength: change.lengthChanged });
      }
    }
    moveNoticeRef.current = null;
    setMoveNotice(null);
  }, [moveNotice, undoReschedule]);

  return { moveNotice, closeMoveNotice, raiseChangeNotice, handleNotifyMove, handleUndoMove };
}
