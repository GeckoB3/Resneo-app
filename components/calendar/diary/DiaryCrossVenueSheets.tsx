import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import {
  cancelOriginalCopy,
  collectiveMoveCopy,
  crossVenueMoveCopy,
  type CrossVenueMoveWords,
  type PendingCrossVenueRebook,
} from '@/lib/calendar/cross-venue-rebook';
import type { CalendarGridBooking } from '@/types/calendar-grid';
import type { LinkedBooking, LinkedVenueCalendar } from '@/types/linked-venues';
import type { VenueBootstrap } from '@/types/venue';

/**
 * A booking dropped on a calendar of another ResNeo account (web #190's
 * cross-account move dialog). See `lib/calendar/cross-venue-rebook.ts`.
 */
export type CrossVenueMoveState = CrossVenueMoveWords & {
  booking: CalendarGridBooking;
  /** The partner venue the dragged booking belongs to, or null for our own. */
  sourceVenue: LinkedVenueCalendar | null;
  sourceLinked: LinkedBooking | null;
  targetColumnId: string;
  /** The partner column dropped on, or null for one of our own. */
  targetLinked: { venue: LinkedVenueCalendar; practitionerId: string | null } | null;
  time: string;
  /**
   * Both venues are in our live collective and the drop names a calendar: the booking moves in
   * one step (web D46, revised 2026-09-16) instead of being booked afresh.
   */
  collectiveMove: { targetCalendarId: string; targetVenueName: string } | null;
};

export interface DiaryCrossVenueSheetsProps {
  crossVenueMove: CrossVenueMoveState | null;
  venue: VenueBootstrap | null;
  moveToVenue: { isPending: boolean };
  confirmCollectiveMove: () => void;
  setCrossVenueMove: (value: null) => void;
  startCrossVenueRebook: () => Promise<void>;
  cancelOriginalPrompt: PendingCrossVenueRebook | null;
  cancelOwnOriginal: { isPending: boolean };
  cancelLinkedOriginal: { isPending: boolean };
  cancelOriginalAfterRebook: () => void;
  setCancelOriginalPrompt: (value: null) => void;
}

/**
 * The two sheets after a drop on another account's calendar: move or book the
 * client afresh there, then cancel the original. Never open together. Moved
 * out of the diary screen unchanged (codebase standards P5.2).
 */
export function DiaryCrossVenueSheets({
  crossVenueMove,
  venue,
  moveToVenue,
  confirmCollectiveMove,
  setCrossVenueMove,
  startCrossVenueRebook,
  cancelOriginalPrompt,
  cancelOwnOriginal,
  cancelLinkedOriginal,
  cancelOriginalAfterRebook,
  setCancelOriginalPrompt,
}: DiaryCrossVenueSheetsProps) {
  return (
    <>
      {crossVenueMove
        ? (() => {
            const target = crossVenueMove.collectiveMove;
            if (target) {
              const copy = collectiveMoveCopy({
                targetCalendarName: crossVenueMove.targetCalendarName,
                targetVenueName: target.targetVenueName,
                ownVenueName: crossVenueMove.sourceVenueName ?? venue?.name ?? 'your business',
                time: crossVenueMove.time,
                visitServiceName:
                  crossVenueMove.booking.group_booking_id && !crossVenueMove.booking.person_label
                    ? (crossVenueMove.booking.serviceName ?? '')
                    : null,
              });
              return (
                <ConfirmSheet
                  visible
                  title={copy.title}
                  message={copy.message}
                  confirmLabel={copy.confirmLabel}
                  cancelLabel="Not now"
                  destructive={false}
                  loading={moveToVenue.isPending}
                  onConfirm={confirmCollectiveMove}
                  onClose={() => setCrossVenueMove(null)}
                />
              );
            }
            const copy = crossVenueMoveCopy(crossVenueMove);
            return (
              <ConfirmSheet
                visible
                title={copy.title}
                message={copy.message}
                confirmLabel={copy.confirmLabel}
                cancelLabel="Not now"
                destructive={false}
                onConfirm={() => void startCrossVenueRebook()}
                onClose={() => setCrossVenueMove(null)}
              />
            );
          })()
        : null}
      {cancelOriginalPrompt
        ? (() => {
            const copy = cancelOriginalCopy(cancelOriginalPrompt);
            return (
              <ConfirmSheet
                visible
                title={copy.title}
                message={copy.message}
                confirmLabel="Cancel the original"
                cancelLabel="Keep both"
                loading={cancelOwnOriginal.isPending || cancelLinkedOriginal.isPending}
                onConfirm={cancelOriginalAfterRebook}
                onClose={() => setCancelOriginalPrompt(null)}
              />
            );
          })()
        : null}
    </>
  );
}
