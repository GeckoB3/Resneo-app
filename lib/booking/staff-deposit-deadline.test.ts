/**
 * Staff deposits work as card requests do (web Docs/deposit-handling-review-plan.md DH1, DH2, DH5):
 * the deadline is the earlier of 24 hours from now or 2 hours before the start, in the business's
 * time zone, and a booking that close to its start, whose client cannot be reached, or whose
 * "Cancel if not paid" was turned off, is kept (Booked with the deposit still due).
 */
import {
  appointmentStartMs,
  depositCancelDeadline,
  depositClientReachable,
  formatDepositDeadline,
  staffCancelIfUnpaidHelp,
  staffCancelIfUnpaidLabel,
  staffDepositDeadlineText,
  staffDepositKeptLine,
  staffDepositNoContactLine,
  staffDepositOutcome,
  staffDepositOutcomeFromServer,
  staffDepositTooCloseLine,
} from '@/lib/booking/staff-deposit-deadline';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-12-01T13:00:00Z');

describe('depositCancelDeadline', () => {
  it('is 24 hours from now when the start is further off', () => {
    expect(depositCancelDeadline(NOW, NOW + 72 * HOUR)).toBe('2026-12-02T13:00:00.000Z');
  });

  it('is 2 hours before the start when that comes first', () => {
    expect(depositCancelDeadline(NOW, NOW + 10 * HOUR)).toBe('2026-12-01T21:00:00.000Z');
  });

  it('is null under 2 hours to go', () => {
    expect(depositCancelDeadline(NOW, NOW + 90 * 60 * 1000)).toBeNull();
    expect(depositCancelDeadline(NOW, NOW + 2 * HOUR)).toBeNull();
  });

  it('is 24 hours when the start is unknown', () => {
    expect(depositCancelDeadline(NOW, null)).toBe('2026-12-02T13:00:00.000Z');
  });
});

describe('formatDepositDeadline', () => {
  it('reads short and long in the business time zone', () => {
    expect(formatDepositDeadline('2026-12-02T13:00:00.000Z', 'Europe/London')).toBe('Wed 2 Dec, 13:00');
    expect(formatDepositDeadline('2026-12-02T13:00:00.000Z', 'Europe/London', 'long')).toBe('Wednesday 2 December at 13:00');
    // British Summer Time: 12:00 UTC is 13:00 in London.
    expect(formatDepositDeadline('2026-07-01T12:00:00.000Z', 'Europe/London')).toBe('Wed 1 Jul, 13:00');
  });
});

describe('appointmentStartMs and staffDepositDeadlineText', () => {
  it('reads the venue-local start', () => {
    expect(appointmentStartMs('2026-07-01', '14:30', 'Europe/London')).toBe(Date.parse('2026-07-01T13:30:00Z'));
    expect(appointmentStartMs('2026-07-01', null, 'Europe/London')).toBeNull();
  });

  it('gives the short deadline, or null under 2 hours to go', () => {
    expect(staffDepositDeadlineText({ date: '2026-12-05', time: '10:00', timeZone: 'Europe/London', nowMs: NOW })).toBe(
      'Wed 2 Dec, 13:00',
    );
    expect(staffDepositDeadlineText({ date: '2026-12-01', time: '18:00', timeZone: 'Europe/London', nowMs: NOW })).toBe(
      'Tue 1 Dec, 16:00',
    );
    expect(staffDepositDeadlineText({ date: '2026-12-01', time: '14:30', timeZone: 'Europe/London', nowMs: NOW })).toBeNull();
  });
});

describe('staffDepositOutcome', () => {
  const base = { cancelIfUnpaid: true, reachable: true, deadlineText: 'Wed 2 Dec, 13:00', word: 'deposit' as const };

  it('waits until the deadline when on, reachable and not too close', () => {
    expect(staffDepositOutcome(base)).toEqual({ kept: false, cancelOn: 'Wed 2 Dec, 13:00', word: 'deposit' });
  });

  it('is kept when turned off, unreachable, or under 2 hours to go', () => {
    expect(staffDepositOutcome({ ...base, cancelIfUnpaid: false }).kept).toBe(true);
    expect(staffDepositOutcome({ ...base, reachable: false }).kept).toBe(true);
    expect(staffDepositOutcome({ ...base, deadlineText: null })).toEqual({ kept: true, cancelOn: null, word: 'deposit' });
  });

  it('knows who can be reached', () => {
    expect(depositClientReachable(' ', '')).toBe(false);
    expect(depositClientReachable(null, '07700 900123')).toBe(true);
  });
});

describe('the words', () => {
  it('match the web, with payment for a full payment and no em-dashes', () => {
    const lines = [
      staffCancelIfUnpaidLabel('Wed 2 Dec, 13:00'),
      staffCancelIfUnpaidHelp(true, 'deposit'),
      staffCancelIfUnpaidHelp(false, 'payment'),
      staffDepositTooCloseLine('deposit'),
      staffDepositNoContactLine('deposit'),
      staffDepositKeptLine('deposit'),
    ];
    expect(lines).toEqual([
      'Cancel if not paid by Wed 2 Dec, 13:00',
      'The booking waits until the client pays, and is cancelled if they do not.',
      'The booking is confirmed now and the payment stays due.',
      'The appointment is less than 2 hours away, so the booking is confirmed now and the deposit stays due.',
      "Cancel if not paid needs the client's email or mobile to send the link. Without them, the booking is confirmed now with the deposit still due, and you can share the payment link from the booking.",
      'The booking is confirmed, with the deposit still due. It stays booked if the deposit is not paid.',
    ]);
    for (const line of lines) expect(line).not.toContain('—');
  });

  it('a full payment waits until the client pays, never "until the payment is paid" (live round 27 Nov 2026)', () => {
    const help = staffCancelIfUnpaidHelp(true, 'payment');
    expect(help).toBe('The booking waits until the client pays, and is cancelled if they do not.');
    expect(help).not.toContain('payment is paid');
  });
});

describe('the outcome the server reports wins', () => {
  it('reads kept and the deadline from the create answer, and is null from an older server', () => {
    expect(staffDepositOutcomeFromServer({ deposit_kept: true, deposit_cancel_at: null }, 'Europe/London', 'deposit')).toEqual({
      kept: true,
      cancelOn: null,
      word: 'deposit',
    });
    expect(
      staffDepositOutcomeFromServer({ deposit_kept: false, deposit_cancel_at: '2026-12-02T13:00:00Z' }, 'Europe/London', 'payment'),
    ).toEqual({ kept: false, cancelOn: 'Wed 2 Dec, 13:00', word: 'payment' });
    expect(staffDepositOutcomeFromServer({}, 'Europe/London', 'deposit')).toBeNull();
  });
});
