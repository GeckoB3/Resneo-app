import {
  addMinutesToTime,
  formatBookingTime,
  formatTimeRange,
  minutesToTime,
  offeringPriceLabel,
  remainingLabel,
  resourceDurationOptions,
  resourceTotalPence,
  timeToMinutes,
} from '@/lib/booking/booking-format';

describe('time math', () => {
  it('timeToMinutes parses HH:mm and HH:mm:ss', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('14:00:00')).toBe(840);
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('minutesToTime formats and clamps to a 24h day', () => {
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(24 * 60)).toBe('23:59');
    expect(minutesToTime(-30)).toBe('00:00');
  });

  it('addMinutesToTime adds a duration to a start time', () => {
    expect(addMinutesToTime('09:00', 90)).toBe('10:30');
    expect(addMinutesToTime('09:30:00', 60)).toBe('10:30');
    expect(addMinutesToTime('09:00', 0)).toBe('09:00');
  });
});

describe('formatBookingTime', () => {
  it('renders 12-hour times with am/pm', () => {
    expect(formatBookingTime('09:30')).toBe('9:30am');
    expect(formatBookingTime('14:05')).toBe('2:05pm');
    expect(formatBookingTime('00:15')).toBe('12:15am');
    expect(formatBookingTime('12:00')).toBe('12:00pm');
    expect(formatBookingTime('17:00:00')).toBe('5:00pm');
  });

  it('formatTimeRange joins start and end', () => {
    expect(formatTimeRange('09:00', '10:30')).toBe('9:00am – 10:30am');
  });
});

describe('resource helpers', () => {
  it('resourceDurationOptions steps from min to max by interval', () => {
    expect(resourceDurationOptions(30, 180, 30)).toEqual([30, 60, 90, 120, 150, 180]);
    expect(resourceDurationOptions(60, 60, 30)).toEqual([60]);
  });

  it('resourceDurationOptions falls back to a 30-min step when inputs are 0', () => {
    expect(resourceDurationOptions(0, 0, 0)).toEqual([30]);
  });

  it('resourceTotalPence multiplies price per slot by slots covered (ceil)', () => {
    expect(resourceTotalPence(1000, 60, 30)).toBe(2000);
    expect(resourceTotalPence(1000, 45, 30)).toBe(2000); // ceil(45/30) = 2
    expect(resourceTotalPence(1000, 30, 30)).toBe(1000);
    expect(resourceTotalPence(null, 60, 30)).toBeNull();
  });
});

describe('offeringPriceLabel', () => {
  it('handles free / pay-at-venue when there is no price', () => {
    expect(offeringPriceLabel(0, 'none', null)).toBe('Free');
    expect(offeringPriceLabel(null, 'none', null)).toBe('Free');
    expect(offeringPriceLabel(0, 'full_payment', null)).toBe('Pay at venue');
  });

  it('shows a deposit label for deposit pricing', () => {
    expect(offeringPriceLabel(1500, 'deposit', 500)).toContain('deposit');
  });

  it('prefixes with "From" when requested', () => {
    expect(offeringPriceLabel(1500, 'none', null, { fromPrefix: true }).startsWith('From')).toBe(true);
  });
});

describe('remainingLabel', () => {
  it('pluralises and handles the sold-out case', () => {
    expect(remainingLabel(0)).toBe('Fully booked');
    expect(remainingLabel(1)).toBe('1 spot left');
    expect(remainingLabel(3)).toBe('3 spots left');
    expect(remainingLabel(2, 'ticket')).toBe('2 tickets left');
  });
});
