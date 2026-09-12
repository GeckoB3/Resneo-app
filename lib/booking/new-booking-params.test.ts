import { newBookingParams } from '@/lib/booking/new-booking-params';

describe('newBookingParams', () => {
  /**
   * The device bug: + on a day three weeks out opened the form on today.
   * The date is not optional, whichever button was pressed.
   */
  it('always carries the day on screen', () => {
    expect(newBookingParams({ date: '2026-09-19', slot: null })).toEqual({ date: '2026-09-19' });
  });

  it('adds the column and the time when a slot was tapped', () => {
    expect(
      newBookingParams({ date: '2026-09-19', slot: { practitionerId: 'cal-1', time: '14:30' } }),
    ).toEqual({ date: '2026-09-19', practitionerId: 'cal-1', time: '14:30' });
  });

  it('starts a walk-in now when no slot was tapped, and at the slot when one was', () => {
    expect(
      newBookingParams({
        date: '2026-09-19',
        slot: null,
        fallbackTime: '11:05',
        intent: 'walk-in',
      }),
    ).toEqual({ date: '2026-09-19', time: '11:05', intent: 'walk-in' });

    expect(
      newBookingParams({
        date: '2026-09-19',
        slot: { practitionerId: 'cal-1', time: '14:30' },
        fallbackTime: '11:05',
        intent: 'walk-in',
      }),
    ).toEqual({
      date: '2026-09-19',
      practitionerId: 'cal-1',
      time: '14:30',
      intent: 'walk-in',
    });
  });

  it('sends no time when there is neither a slot nor a fallback', () => {
    expect(newBookingParams({ date: '2026-09-19', slot: null, fallbackTime: null })).toEqual({
      date: '2026-09-19',
    });
  });
});
