import {
  canShowCancelStaffAttendanceConfirmationAction,
  canShowConfirmStaffAttendanceConfirmationAction,
  isAttendanceConfirmed,
  showAttendanceConfirmedSupplementPill,
  showDepositPendingPill,
  type BookingStaffIndicatorInput,
} from '@/lib/booking/booking-staff-indicators';

/**
 * Staff-facing booking indicator derivations (pure): which pills show and
 * whether the attendance confirm/cancel actions are available, derived purely
 * from booking row fields.
 */

describe('showDepositPendingPill', () => {
  it('shows only when deposit_status is Pending and the amount is positive', () => {
    expect(showDepositPendingPill({ deposit_status: 'Pending', deposit_amount_pence: 1000 })).toBe(true);
  });

  it('hides when the deposit status is not Pending', () => {
    expect(showDepositPendingPill({ deposit_status: 'Paid', deposit_amount_pence: 1000 })).toBe(false);
    expect(showDepositPendingPill({ deposit_amount_pence: 1000 })).toBe(false);
  });

  it('hides when the amount is zero, missing, or negative', () => {
    expect(showDepositPendingPill({ deposit_status: 'Pending', deposit_amount_pence: 0 })).toBe(false);
    expect(showDepositPendingPill({ deposit_status: 'Pending' })).toBe(false);
    expect(showDepositPendingPill({ deposit_status: 'Pending', deposit_amount_pence: -50 })).toBe(false);
  });
});

describe('isAttendanceConfirmed', () => {
  it('is true when lifecycle status is Confirmed', () => {
    expect(isAttendanceConfirmed({ status: 'Confirmed' })).toBe(true);
  });

  it('is true when either attendance timestamp is a non-blank string', () => {
    expect(isAttendanceConfirmed({ guest_attendance_confirmed_at: '2026-06-09T10:00:00' })).toBe(true);
    expect(isAttendanceConfirmed({ staff_attendance_confirmed_at: '2026-06-09T10:00:00' })).toBe(true);
  });

  it('is false with no Confirmed status and no (non-blank) timestamps', () => {
    expect(isAttendanceConfirmed({ status: 'Booked' })).toBe(false);
    expect(isAttendanceConfirmed({})).toBe(false);
    expect(isAttendanceConfirmed({ guest_attendance_confirmed_at: '   ' })).toBe(false);
    expect(isAttendanceConfirmed({ guest_attendance_confirmed_at: null })).toBe(false);
  });
});

describe('showAttendanceConfirmedSupplementPill', () => {
  it('shows a supplement pill when attendance is confirmed but status is not Confirmed', () => {
    expect(
      showAttendanceConfirmedSupplementPill({ status: 'Booked', staff_attendance_confirmed_at: '2026-06-09T10:00:00' }),
    ).toBe(true);
  });

  it('hides the supplement when the primary status is already Confirmed', () => {
    expect(
      showAttendanceConfirmedSupplementPill({ status: 'Confirmed', staff_attendance_confirmed_at: '2026-06-09T10:00:00' }),
    ).toBe(false);
  });

  it('hides when no attendance timestamp is set', () => {
    expect(showAttendanceConfirmedSupplementPill({ status: 'Booked' })).toBe(false);
  });
});

describe('canShowConfirmStaffAttendanceConfirmationAction', () => {
  it('offers confirm when nobody has confirmed yet on an actionable status', () => {
    expect(canShowConfirmStaffAttendanceConfirmationAction({ status: 'Booked' })).toBe(true);
    expect(canShowConfirmStaffAttendanceConfirmationAction({ status: 'Pending' })).toBe(true);
  });

  it('never offers confirm for walk-ins', () => {
    expect(canShowConfirmStaffAttendanceConfirmationAction({ status: 'Booked', source: 'walk-in' })).toBe(false);
  });

  it('does not offer confirm once attendance is already confirmed', () => {
    expect(
      canShowConfirmStaffAttendanceConfirmationAction({ status: 'Booked', staff_attendance_confirmed_at: '2026-06-09T10:00:00' }),
    ).toBe(false);
    expect(canShowConfirmStaffAttendanceConfirmationAction({ status: 'Confirmed' })).toBe(false);
  });

  it('does not offer confirm on in-progress/terminal statuses', () => {
    for (const status of ['Cancelled', 'No-Show', 'Completed', 'Seated'] as const) {
      expect(canShowConfirmStaffAttendanceConfirmationAction({ status })).toBe(false);
    }
  });
});

describe('canShowCancelStaffAttendanceConfirmationAction', () => {
  it('offers cancel when attendance is confirmed on an actionable status', () => {
    expect(
      canShowCancelStaffAttendanceConfirmationAction({ status: 'Booked', staff_attendance_confirmed_at: '2026-06-09T10:00:00' }),
    ).toBe(true);
  });

  it('does not offer cancel when attendance was never confirmed', () => {
    expect(canShowCancelStaffAttendanceConfirmationAction({ status: 'Booked' })).toBe(false);
  });

  it('never offers cancel for walk-ins', () => {
    expect(
      canShowCancelStaffAttendanceConfirmationAction({ status: 'Booked', source: 'walk-in', staff_attendance_confirmed_at: '2026-06-09T10:00:00' }),
    ).toBe(false);
  });

  it('does not offer cancel on in-progress/terminal statuses even if confirmed', () => {
    expect(
      canShowCancelStaffAttendanceConfirmationAction({ status: 'Completed', staff_attendance_confirmed_at: '2026-06-09T10:00:00' }),
    ).toBe(false);
    // 'Confirmed' lifecycle status counts as attendance-confirmed and is actionable.
    expect(canShowCancelStaffAttendanceConfirmationAction({ status: 'Confirmed' })).toBe(true);
  });
});
