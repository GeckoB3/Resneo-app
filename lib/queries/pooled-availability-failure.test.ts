/**
 * R20-5 — a pooled "Any available" search must say when it could not check
 * everyone.
 *
 * The fan-out is one request per practitioner, merged client-side, so a failed
 * request silently contributes no slots. Before this, `isError` fired only when
 * EVERY request failed, which meant one practitioner's 503 dropped them from the
 * merged list with nothing said. Web's Stage 7 makes the staff availability
 * route fail closed precisely so a partial answer is never presented as a whole
 * one; swallowing it here put it straight back.
 *
 * @see Docs/APP_GAP_REPORT_R20_WEB_DELTA.md (R20-5)
 */
import { pooledAvailabilityFailureState } from '@/lib/queries/useAppointmentAvailability';

describe('pooledAvailabilityFailureState', () => {
  it('is neither an error nor partial when everything loaded', () => {
    expect(pooledAvailabilityFailureState(3, 0)).toEqual({
      isError: false,
      unavailableCount: 0,
    });
  });

  it('is an error only when NOTHING loaded', () => {
    expect(pooledAvailabilityFailureState(3, 3)).toEqual({
      isError: true,
      unavailableCount: 0,
    });
  });

  it('reports a partial answer rather than failing when some loaded', () => {
    // The heart of R20-5: two calendars answered, one did not. The slots we have
    // are real, so we show them — and say one is missing.
    expect(pooledAvailabilityFailureState(3, 1)).toEqual({
      isError: false,
      unavailableCount: 1,
    });
    expect(pooledAvailabilityFailureState(5, 4)).toEqual({
      isError: false,
      unavailableCount: 4,
    });
  });

  it('does not double-report: a total failure is an error, not a count', () => {
    // Otherwise the UI would show an error state AND "couldn't check 3 team
    // members" over an empty list.
    const { isError, unavailableCount } = pooledAvailabilityFailureState(3, 3);
    expect(isError).toBe(true);
    expect(unavailableCount).toBe(0);
  });

  it('treats a single failed practitioner as an error, since nothing loaded', () => {
    expect(pooledAvailabilityFailureState(1, 1)).toEqual({
      isError: true,
      unavailableCount: 0,
    });
  });

  it('is inert before any request exists', () => {
    expect(pooledAvailabilityFailureState(0, 0)).toEqual({
      isError: false,
      unavailableCount: 0,
    });
  });
});
