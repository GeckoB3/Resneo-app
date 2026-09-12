import {
  guestVisitHistory,
  visitHistoryCaption,
  visitHistoryCountLabel,
} from '@/lib/booking/guest-visit-history';

const day = (iso: string) => `day(${iso})`;

describe('guestVisitHistory', () => {
  it('leaves the totals alone before the booking is seated', () => {
    expect(
      guestVisitHistory({ status: 'Booked', visitCount: 3, lastVisitDate: '2026-08-01' }),
    ).toEqual({ priorVisits: 3, lastVisitDate: '2026-08-01' });
  });

  it('takes this booking back out once it is Seated', () => {
    // The device case: a 21 Sep booking marked Arrived on 12 Sep for a guest
    // with no other bookings. The server made it 1 visit / last visit today.
    expect(
      guestVisitHistory({ status: 'Seated', visitCount: 1, lastVisitDate: '2026-09-12' }),
    ).toEqual({ priorVisits: 0, lastVisitDate: null });
  });

  it('does the same for a Completed booking', () => {
    expect(
      guestVisitHistory({ status: 'Completed', visitCount: 4, lastVisitDate: '2026-09-12' }),
    ).toEqual({ priorVisits: 3, lastVisitDate: null });
  });

  it.each(['Pending', 'Confirmed', 'Cancelled', 'No-Show'])(
    'does not subtract for %s',
    (status) => {
      expect(guestVisitHistory({ status, visitCount: 2, lastVisitDate: null }).priorVisits).toBe(2);
    },
  );

  it('counts a visit once across all of its services', () => {
    // Device case: seating the 09:00 service of a two-service visit left the
    // 11:30 one reading "2 previous visits" while the 09:00 one read "1".
    const args = { visitCount: 2, lastVisitDate: '2026-09-12' };
    expect(
      guestVisitHistory({ ...args, status: 'Booked', siblingStatuses: ['Seated', 'Booked'] }),
    ).toEqual({ priorVisits: 1, lastVisitDate: null });
    // No sibling seated yet: nothing has been counted.
    expect(
      guestVisitHistory({ ...args, status: 'Booked', siblingStatuses: ['Booked', 'Confirmed'] }),
    ).toEqual({ priorVisits: 2, lastVisitDate: '2026-09-12' });
  });

  it('never goes negative, and treats missing values as none', () => {
    expect(guestVisitHistory({ status: 'Seated', visitCount: 0, lastVisitDate: null })).toEqual({
      priorVisits: 0,
      lastVisitDate: null,
    });
    expect(
      guestVisitHistory({ status: undefined, visitCount: undefined, lastVisitDate: undefined }),
    ).toEqual({ priorVisits: 0, lastVisitDate: null });
  });
});

describe('visitHistoryCaption', () => {
  it('names the date when there is one to name', () => {
    expect(visitHistoryCaption({ priorVisits: 2, lastVisitDate: '2026-08-01' }, day)).toBe(
      'Last visit day(2026-08-01)',
    );
  });

  it('falls back to the count when the stamp was this booking', () => {
    expect(visitHistoryCaption({ priorVisits: 1, lastVisitDate: null }, day)).toBe(
      '1 previous visit',
    );
    expect(visitHistoryCaption({ priorVisits: 3, lastVisitDate: null }, day)).toBe(
      '3 previous visits',
    );
  });

  it('says First visit only when nothing precedes this booking', () => {
    expect(visitHistoryCaption({ priorVisits: 0, lastVisitDate: null }, day)).toBe('First visit');
  });
});

describe('visitHistoryCountLabel', () => {
  it('pluralises, and calls no history a first visit', () => {
    expect(visitHistoryCountLabel({ priorVisits: 0, lastVisitDate: '2026-08-01' })).toBe(
      'First visit',
    );
    expect(visitHistoryCountLabel({ priorVisits: 1, lastVisitDate: null })).toBe('1 previous visit');
    expect(visitHistoryCountLabel({ priorVisits: 2, lastVisitDate: null })).toBe(
      '2 previous visits',
    );
  });
});
