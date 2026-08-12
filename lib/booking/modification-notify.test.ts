import {
  bookingStartMoved,
  guestNotifyPlanForChange,
} from '@/lib/booking/modification-notify';

const SAME_DAY = { previousDate: '2026-08-12', nextDate: '2026-08-12' };

describe('bookingStartMoved', () => {
  it('is true when the time changed', () => {
    expect(
      bookingStartMoved({ ...SAME_DAY, previousTime: '09:00:00', nextTime: '10:30:00' }),
    ).toBe(true);
  });

  it('is true when only the date changed', () => {
    expect(
      bookingStartMoved({
        previousDate: '2026-08-12',
        nextDate: '2026-08-13',
        previousTime: '09:00:00',
        nextTime: '09:00:00',
      }),
    ).toBe(true);
  });

  it('is false for a pure resize — same start, different length', () => {
    expect(
      bookingStartMoved({ ...SAME_DAY, previousTime: '09:00:00', nextTime: '09:00:00' }),
    ).toBe(false);
  });

  it('compares on the wall clock, so HH:mm and HH:mm:ss agree', () => {
    // The two sides of a drag come from different sources (a grid row vs a
    // freshly formatted commit) and are not always the same width. Treating
    // that as a move would arm the notify prompt on every resize.
    expect(bookingStartMoved({ ...SAME_DAY, previousTime: '09:00', nextTime: '09:00:00' })).toBe(
      false,
    );
    expect(bookingStartMoved({ ...SAME_DAY, previousTime: '09:00:00', nextTime: '09:00' })).toBe(
      false,
    );
  });

  it('ignores surrounding whitespace rather than reading it as a move', () => {
    expect(
      bookingStartMoved({ ...SAME_DAY, previousTime: ' 09:00:00 ', nextTime: '09:00:00' }),
    ).toBe(false);
  });

  it('ignores seconds, which no drag path sets and the server does not email about', () => {
    expect(
      bookingStartMoved({ ...SAME_DAY, previousTime: '09:00:30', nextTime: '09:00:45' }),
    ).toBe(false);
  });
});

describe('guestNotifyPlanForChange', () => {
  it('defers and prompts when the start moved', () => {
    expect(
      guestNotifyPlanForChange({ ...SAME_DAY, previousTime: '09:00:00', nextTime: '11:00:00' }),
    ).toEqual({ skip: false, prompt: true });
  });

  it('skips and stays silent on a pure resize', () => {
    // The guest is due at the same time; offering to "notify them of the
    // change" told them their appointment had moved when it had not.
    expect(
      guestNotifyPlanForChange({ ...SAME_DAY, previousTime: '09:00:00', nextTime: '09:00:00' }),
    ).toEqual({ skip: true, prompt: false });
  });
});
