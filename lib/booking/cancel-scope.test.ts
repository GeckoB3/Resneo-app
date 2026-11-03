import {
  bookingStatusChange,
  bookingStatusPatchBody,
  cancelScopeQuestion,
  liveVisitServiceCount,
} from '@/lib/booking/cancel-scope';

describe('bookingStatusPatchBody (split-visit plan G17)', () => {
  it('cancels just this service when asked', () => {
    expect(bookingStatusPatchBody({ status: 'Cancelled', cancelScope: 'service' })).toEqual({
      status: 'Cancelled',
      cancel_scope: 'service',
    });
  });

  it('keeps the cascade for "Cancel all with us": no scope is sent', () => {
    expect(bookingStatusPatchBody({ status: 'Cancelled', cancelScope: 'part' })).toEqual({ status: 'Cancelled' });
    expect(bookingStatusPatchBody({ status: 'Cancelled' })).toEqual({ status: 'Cancelled' });
  });

  it('never sends a scope on another status, and keeps the unpaid acknowledgement', () => {
    expect(bookingStatusPatchBody({ status: 'Booked', acceptUnpaid: true, cancelScope: 'service' })).toEqual({
      status: 'Booked',
      accept_unpaid: true,
    });
  });
});

describe('bookingStatusChange', () => {
  it('builds the narrow cancel the mutation sends', () => {
    expect(bookingStatusChange('Cancelled', { cancelScope: 'service' })).toEqual({
      status: 'Cancelled',
      cancel_scope: 'service',
    });
    expect(bookingStatusChange('Cancelled')).toBe('Cancelled');
    expect(bookingStatusChange('Booked', { acceptUnpaid: true })).toEqual({ status: 'Booked', accept_unpaid: true });
  });
});

describe('the cancel choice', () => {
  it('counts only the services still to happen', () => {
    expect(
      liveVisitServiceCount([
        { status: 'Booked' },
        { status: 'Seated' },
        { status: 'Cancelled' },
        { status: 'No-Show' },
        { status: 'Completed' },
      ]),
    ).toBe(2);
  });

  it('asks in the web wording, with plain fallbacks', () => {
    expect(cancelScopeQuestion('Brow Wax', 'QA Client')).toBe(
      'Cancel just Brow Wax, or every service QA Client has with you on this visit?',
    );
    expect(cancelScopeQuestion(null, '')).toBe(
      'Cancel just this service, or every service the client has with you on this visit?',
    );
  });
});
