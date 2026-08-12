/**
 * Staff-facing booking indicators (pills + action gating) — pure derivations
 * from booking row fields. Ported from web
 * `src/lib/booking/booking-staff-indicators.ts` so the mobile list/detail
 * surfaces match the web dashboard exactly.
 */

export interface BookingStaffIndicatorInput {
  status?: string | null;
  deposit_status?: string | null;
  deposit_amount_pence?: number | null;
  guest_attendance_confirmed_at?: string | null;
  staff_attendance_confirmed_at?: string | null;
}

/** Outstanding deposit worth surfacing: status Pending and a positive amount. */
export function showDepositPendingPill(row: BookingStaffIndicatorInput): boolean {
  // Card-hold states ('Card Held', 'Charged') intentionally do not show this pill: nothing is
  // owed upfront, so there is no pending deposit to chase.
  if (row.deposit_status !== 'Pending') return false;
  const pence = row.deposit_amount_pence ?? 0;
  return pence > 0;
}

/**
 * Statuses where a deposit pill is still meaningful. A cancelled or completed
 * booking carries stale deposit columns, and a red "Deposit failed" on a
 * cancelled row would send staff chasing money nobody owes.
 */
const DEPOSIT_PILL_LIVE_STATUSES = ['Pending', 'Booked', 'Confirmed'];

/**
 * A payment attempt failed and the money (or card save) is still owed.
 *
 * No amount gate, unlike the pending pill: `payment_with_setup` hold rows carry
 * `deposit_amount_pence` NULL, and a `'Failed'` state is always a failed
 * collection. Pair it with {@link depositPillAppliesToStatus} at the render
 * site, mirroring web.
 */
export function showDepositFailedPill(row: BookingStaffIndicatorInput): boolean {
  return row.deposit_status === 'Failed';
}

/** Render-site status gate for the deposit pills (see the list above). */
export function depositPillAppliesToStatus(status: string | null | undefined): boolean {
  return DEPOSIT_PILL_LIVE_STATUSES.includes(status ?? '');
}

/**
 * True when attendance is considered confirmed: lifecycle `Confirmed`, or either
 * attendance timestamp is set (guest link or staff confirm).
 */
export function isAttendanceConfirmed(row: BookingStaffIndicatorInput): boolean {
  if (row.status === 'Confirmed') return true;
  return (
    Boolean(row.guest_attendance_confirmed_at?.trim()) ||
    Boolean(row.staff_attendance_confirmed_at?.trim())
  );
}

/**
 * Second "Confirmed" pill for lists/cards: guest and/or staff confirmed, but
 * lifecycle `status` is not already `Confirmed` (the primary status pill already
 * shows Confirmed in that case).
 */
export function showAttendanceConfirmedSupplementPill(row: BookingStaffIndicatorInput): boolean {
  if (row.status === 'Confirmed') return false;
  return (
    Boolean(row.guest_attendance_confirmed_at?.trim()) ||
    Boolean(row.staff_attendance_confirmed_at?.trim())
  );
}

/** Statuses where attendance confirmation is no longer actionable (in-progress / terminal). */
const ATTENDANCE_ACTION_EXCLUDED = new Set(['Cancelled', 'No-Show', 'Completed', 'Seated']);

/** Staff "Confirm attendance" when nobody (guest or staff) has confirmed yet. */
export function canShowConfirmStaffAttendanceConfirmationAction(
  row: BookingStaffIndicatorInput & { source?: string | null; status: string },
): boolean {
  if (row.source === 'walk-in') return false;
  if (isAttendanceConfirmed(row)) return false;
  return !ATTENDANCE_ACTION_EXCLUDED.has(row.status);
}

/** Staff control to undo attendance confirmation. */
export function canShowCancelStaffAttendanceConfirmationAction(
  row: BookingStaffIndicatorInput & { source?: string | null; status: string },
): boolean {
  if (row.source === 'walk-in') return false;
  if (!isAttendanceConfirmed(row)) return false;
  return !ATTENDANCE_ACTION_EXCLUDED.has(row.status);
}

/**
 * Whether to surface the staff attendance Confirm/Unconfirm toggle in booking
 * detail. It's the union of the confirm + cancel gating, MINUS the case where a
 * lifecycle `Confirmed` booking already offers the "Undo confirm" status revert
 * (target `Booked`): that single revert cancels the confirmation, so a second
 * "Unconfirm" attendance button next to it is redundant.
 *
 * Mirrors web `ExpandedBookingContent` `showUndoAttendanceViaPatch`. The confirm
 * side is independently inert once `isAttendanceConfirmed` (which `Confirmed`
 * implies), so guarding the whole toggle reproduces the web's visible behaviour:
 * a `Confirmed` booking shows only "Undo confirm".
 */
export function canShowStaffAttendanceToggle(
  row: BookingStaffIndicatorInput & { source?: string | null; status: string },
  revertTarget: string | null | undefined,
): boolean {
  if (row.status === 'Confirmed' && revertTarget === 'Booked') return false;
  return (
    canShowConfirmStaffAttendanceConfirmationAction(row) ||
    canShowCancelStaffAttendanceConfirmationAction(row)
  );
}
