/**
 * Staff-first ordering rule for the app's new-booking wizard.
 *
 * Pins the app to the web's `orderingForSession` (resneo#129). The toggle is not
 * public-only: the staff-facing form reorders too, so the app must follow. The
 * exclusions are the interesting part — reorder only when the session does not
 * already know the answer to one of the two questions.
 */
import {
  calendarSlotPrefillActive,
  resolveAppointmentFlowOrdering,
  type AppointmentFlowOrderingInput,
} from '@/lib/booking/appointment-flow-order';

function input(over: Partial<AppointmentFlowOrderingInput> = {}): AppointmentFlowOrderingInput {
  return {
    flagEnabled: true,
    prefilledDate: null,
    prefilledTime: null,
    prefilledPractitionerId: null,
    isWalkIn: false,
    rebookSeededAppointment: false,
    ...over,
  };
}

describe('resolveAppointmentFlowOrdering', () => {
  it('is service-first when the venue has the toggle off', () => {
    expect(resolveAppointmentFlowOrdering(input({ flagEnabled: false }))).toBe('service_first');
  });

  it('is staff-first for a plain new booking when the toggle is on', () => {
    expect(resolveAppointmentFlowOrdering(input())).toBe('staff_first');
  });

  it('stays service-first when a rebook already knows the service', () => {
    expect(
      resolveAppointmentFlowOrdering(input({ rebookSeededAppointment: true })),
    ).toBe('service_first');
  });

  it('stays service-first when a calendar slot tap already knows the person', () => {
    expect(
      resolveAppointmentFlowOrdering(
        input({
          prefilledDate: '2026-08-10',
          prefilledTime: '14:00',
          prefilledPractitionerId: 'prac-1',
        }),
      ),
    ).toBe('service_first');
  });

  it('reorders a walk-in even when launched from a column (web parity)', () => {
    // Someone at the desk asks for a person as often as for a service, so the
    // tapped column is not treated as the answer.
    expect(
      resolveAppointmentFlowOrdering(
        input({
          isWalkIn: true,
          prefilledDate: '2026-08-10',
          prefilledTime: '14:00',
          prefilledPractitionerId: 'prac-1',
        }),
      ),
    ).toBe('staff_first');
  });

  it('needs all three prefills before the person counts as settled', () => {
    // A date alone, or a date and time with no column, leaves "who" open.
    expect(
      resolveAppointmentFlowOrdering(input({ prefilledDate: '2026-08-10' })),
    ).toBe('staff_first');
    expect(
      resolveAppointmentFlowOrdering(
        input({ prefilledDate: '2026-08-10', prefilledTime: '14:00' }),
      ),
    ).toBe('staff_first');
    expect(
      resolveAppointmentFlowOrdering(input({ prefilledPractitionerId: 'prac-1' })),
    ).toBe('staff_first');
  });

  it('treats blank params as absent rather than as a prefill', () => {
    expect(
      resolveAppointmentFlowOrdering(
        input({ prefilledDate: '  ', prefilledTime: '  ', prefilledPractitionerId: '  ' }),
      ),
    ).toBe('staff_first');
  });

  it('keeps the toggle-off answer whatever else is set', () => {
    expect(
      resolveAppointmentFlowOrdering(input({ flagEnabled: false, isWalkIn: true })),
    ).toBe('service_first');
  });
});

describe('calendarSlotPrefillActive', () => {
  const base = {
    prefilledDate: '2026-08-10',
    prefilledTime: '14:00',
    prefilledPractitionerId: 'prac-1',
    isWalkIn: false,
    rebookSeededAppointment: false,
  };

  it('is true only with date, time and column together', () => {
    expect(calendarSlotPrefillActive(base)).toBe(true);
    expect(calendarSlotPrefillActive({ ...base, prefilledTime: null })).toBe(false);
  });

  it('is false for a walk-in, however complete the prefill', () => {
    expect(calendarSlotPrefillActive({ ...base, isWalkIn: true })).toBe(false);
  });

  it('is false for a rebook, which is excluded on its own terms', () => {
    expect(calendarSlotPrefillActive({ ...base, rebookSeededAppointment: true })).toBe(false);
  });
});
