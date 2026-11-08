import { ApiError } from '@/lib/api/client';
import {
  STALE_BOOKING_MESSAGE,
  expectedVersionField,
  expectedVisitVersionsField,
  isStaleBookingError,
} from '@/lib/booking/stale-booking';

describe('stale booking versions (web QA X-F2)', () => {
  it('sends a version only when the sheet has one, so an unknown version changes nothing', () => {
    expect(expectedVersionField('2026-11-08T10:00:00+00:00')).toEqual({
      expected_updated_at: '2026-11-08T10:00:00+00:00',
    });
    expect(expectedVersionField(null)).toEqual({});
    expect(expectedVersionField(undefined)).toEqual({});
    expect(expectedVersionField('  ')).toEqual({});
  });

  it('sends a visit the opened booking\'s version by its id', () => {
    expect(expectedVisitVersionsField('b1', 'v1')).toEqual({ expected_versions: { b1: 'v1' } });
    expect(expectedVisitVersionsField('b1', null)).toEqual({});
    expect(expectedVisitVersionsField(null, 'v1')).toEqual({});
  });

  it('recognises the web\'s stale refusal by status and code, not by its words', () => {
    expect(isStaleBookingError(new ApiError('x', 412, { error: 'x', code: 'stale_booking' }))).toBe(true);
    expect(isStaleBookingError(new ApiError('x', 412, { error: 'x', code: 'stale_visit' }))).toBe(true);
    expect(isStaleBookingError(new ApiError('x', 412, { error: 'x', code: 'STALE_RESOURCE' }))).toBe(false);
    expect(isStaleBookingError(new ApiError('x', 409, { error: 'x', code: 'stale_booking' }))).toBe(false);
    expect(isStaleBookingError(new Error('x'))).toBe(false);
  });

  it('uses plain words with no em-dash', () => {
    expect(STALE_BOOKING_MESSAGE).toBe('Someone else changed this booking. Refresh to see their change, then try again.');
    expect(STALE_BOOKING_MESSAGE).not.toMatch(/\u2014/);
  });
});
