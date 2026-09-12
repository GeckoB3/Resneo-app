/**
 * The "stop offering this service here" confirmation, shared by every surface
 * that writes calendar↔service links.
 *
 * A first save is sent plainly. When the routes answer 409 with the bookings
 * that would be left behind ([[service-removal]]), the flow holds that save,
 * hands the caller the list to show, and — once the operator has seen it —
 * moves whatever they chose to move and re-sends the SAME save acknowledged.
 * Any other failure is rethrown untouched, so an ordinary 409 still reads as a
 * refusal.
 *
 * @see C:\Resneo\src\app\dashboard\availability\AppointmentAvailabilitySettings.tsx
 *      (putServiceLinks / confirmServiceRemoval — the web's flow)
 */
import { useCallback, useRef, useState } from 'react';

import { ApiError } from '@/lib/api/client';
import { useRescheduleBookingById } from '@/lib/queries/useBookingMutations';
import {
  parseServiceRemovalConfirmation,
  runServiceRemovalMoves,
  serviceRemovalMoveInput,
  withoutMovedBookings,
  type ServiceRemovalConfirmation,
  type ServiceRemovalMove,
  type ServiceRemovalMoveFailure,
} from '@/lib/services/service-removal';

/**
 * One service-link save, run with or without the acknowledgement.
 *
 * The flow calls it twice at most and with the same arguments both times, so a
 * caller must close over the payload rather than rebuild it from state that the
 * confirmation step may have moved on from.
 */
export type ServiceLinkSave = (acknowledge: boolean) => Promise<unknown>;

export interface ServiceRemovalFlow {
  /** The bookings to show, or null when nothing is pending. */
  confirmation: ServiceRemovalConfirmation | null;
  /** Bookings that could not be moved on the last attempt, with the reason given. */
  failures: ServiceRemovalMoveFailure[];
  /** True while the moves and the acknowledged save are in flight. */
  saving: boolean;
  /** Anything that went wrong confirming, for the panel's error line. */
  error: string | null;
  /**
   * Run a service-link save. `'saved'` means it went through; `'needs_confirmation'`
   * means {@link confirmation} is now set and the caller should show the panel.
   * Every other failure throws, exactly as the bare mutation would.
   */
  start: (save: ServiceLinkSave) => Promise<'saved' | 'needs_confirmation'>;
  /** The operator has seen the list: move what they chose, then save acknowledged. */
  confirm: (moves: ServiceRemovalMove[]) => Promise<'saved' | 'move_failed' | 'error'>;
  /** Drop the pending save (the operator backed out). */
  cancel: () => void;
}

export function useServiceRemovalFlow(): ServiceRemovalFlow {
  const reschedule = useRescheduleBookingById();
  const [confirmation, setConfirmation] = useState<ServiceRemovalConfirmation | null>(null);
  const [failures, setFailures] = useState<ServiceRemovalMoveFailure[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state: the acknowledged retry must be the save that was refused,
  // not whatever the form holds by the time the operator answers.
  const pendingSave = useRef<ServiceLinkSave | null>(null);

  const reset = useCallback(() => {
    pendingSave.current = null;
    setConfirmation(null);
    setFailures([]);
    setError(null);
  }, []);

  const start = useCallback<ServiceRemovalFlow['start']>(async (save) => {
    setFailures([]);
    setError(null);
    try {
      await save(false);
      pendingSave.current = null;
      setConfirmation(null);
      return 'saved';
    } catch (e) {
      const parsed =
        e instanceof ApiError && e.status === 409 ? parseServiceRemovalConfirmation(e.body) : null;
      if (!parsed) throw e;
      pendingSave.current = save;
      setConfirmation(parsed);
      return 'needs_confirmation';
    }
  }, []);

  const confirm = useCallback<ServiceRemovalFlow['confirm']>(
    async (moves) => {
      const save = pendingSave.current;
      if (!confirmation || !save) return 'error';
      setSaving(true);
      setError(null);
      try {
        if (moves.length > 0) {
          const { movedIds, failures: moveFailures } = await runServiceRemovalMoves(
            moves,
            confirmation.bookings,
            (booking, targetCalendarId) =>
              reschedule.mutateAsync(serviceRemovalMoveInput(booking, targetCalendarId)),
          );
          if (moveFailures.length > 0) {
            // Keep the panel open on what is left: the ones that did move are
            // gone from the list, so a second attempt cannot move them twice.
            setConfirmation(withoutMovedBookings(confirmation, movedIds));
            setFailures(moveFailures);
            return 'move_failed';
          }
        }
        await save(true);
        reset();
        return 'saved';
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not save. Please try again.');
        return 'error';
      } finally {
        setSaving(false);
      }
    },
    [confirmation, reschedule, reset],
  );

  return { confirmation, failures, saving, error, start, confirm, cancel: reset };
}
