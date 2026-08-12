import {
  bookingCalendarBlockPalette,
  bookingDisplayVisualKey,
  bookingStatusVisualForKey,
  isArrivedWaitingDisplay,
  type BookingStatusVisualRow,
} from '@/lib/booking/booking-status-visual';

/**
 * Booking status visual derivations (pure). The exact hex values are data, not
 * logic, so the tests assert the *branching* — which visual key a row resolves
 * to (lifecycle + attendance + arrived overlay) and that lookups fall back to a
 * default — rather than pinning every colour.
 */

function row(overrides: Partial<BookingStatusVisualRow> & { status: string }): BookingStatusVisualRow {
  return { ...overrides };
}

/** sRGB relative luminance (WCAG 2.x §relative-luminance) for a `#rrggbb`. */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two `#rrggbb` colours (1 to 21). */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('bookingStatusVisualForKey', () => {
  it('returns the mapped visual for a known status key', () => {
    const pending = bookingStatusVisualForKey('Pending');
    expect(pending.dotColor).toBe('#EA580C');
    // The BAR fill is darker than the dot on purpose: white text on orange-600
    // fails AA (2.53:1 to 2.96:1), so the bar uses orange-800 (R14-3).
    expect(pending.calendarBlock.bg).toBe('#9A3412');
  });

  it('keeps every white-on-fill calendar bar above the AA contrast floor', () => {
    // Pins the R14-3 fix so a future palette tweak cannot quietly undo it.
    // Bars whose text is a deep hue on a light fill (Arrived, Cancelled) are
    // covered by the same check from the other direction.
    for (const key of ['Pending', 'Deposit Pending', 'Booked', 'Confirmed', 'Seated', 'Arrived', 'Cancelled']) {
      const block = bookingStatusVisualForKey(key).calendarBlock;
      expect({ key, ratio: contrastRatio(block.text, block.bg) >= 4.5 }).toEqual({
        key,
        ratio: true,
      });
    }
  });

  it('falls back to the default visual for an unknown key', () => {
    const fallback = bookingStatusVisualForKey('Totally-Unknown');
    expect(fallback).toEqual(bookingStatusVisualForKey('definitely-not-a-status'));
    expect(fallback.dotColor).toBe('#8A969C'); // DEFAULT.dotColor
  });
});

describe('isArrivedWaitingDisplay', () => {
  it('is true only when the guest has arrived AND status is Pending/Booked/Confirmed', () => {
    expect(isArrivedWaitingDisplay(row({ status: 'Pending', client_arrived_at: '2026-06-09T10:00:00' }))).toBe(true);
    expect(isArrivedWaitingDisplay(row({ status: 'Booked', client_arrived_at: '2026-06-09T10:00:00' }))).toBe(true);
    expect(isArrivedWaitingDisplay(row({ status: 'Confirmed', client_arrived_at: '2026-06-09T10:00:00' }))).toBe(true);
  });

  it('is false without an arrival timestamp', () => {
    expect(isArrivedWaitingDisplay(row({ status: 'Pending' }))).toBe(false);
    expect(isArrivedWaitingDisplay(row({ status: 'Pending', client_arrived_at: null }))).toBe(false);
  });

  it('is false once the booking has already started/finished even if arrived is set', () => {
    expect(isArrivedWaitingDisplay(row({ status: 'Seated', client_arrived_at: '2026-06-09T10:00:00' }))).toBe(false);
    expect(isArrivedWaitingDisplay(row({ status: 'Completed', client_arrived_at: '2026-06-09T10:00:00' }))).toBe(false);
  });
});

describe('bookingDisplayVisualKey', () => {
  it('passes through the terminal/explicit statuses', () => {
    expect(bookingDisplayVisualKey(row({ status: 'Cancelled' }))).toBe('Cancelled');
    expect(bookingDisplayVisualKey(row({ status: 'No-Show' }))).toBe('No-Show');
    expect(bookingDisplayVisualKey(row({ status: 'Completed' }))).toBe('Completed');
    expect(bookingDisplayVisualKey(row({ status: 'Seated' }))).toBe('Seated');
    expect(bookingDisplayVisualKey(row({ status: 'Confirmed' }))).toBe('Confirmed');
  });

  it('maps a bare Pending / Booked row to its own key', () => {
    expect(bookingDisplayVisualKey(row({ status: 'Pending' }))).toBe('Pending');
    expect(bookingDisplayVisualKey(row({ status: 'Booked' }))).toBe('Booked');
  });

  it('overlays Arrived when the guest arrived while still waiting', () => {
    expect(
      bookingDisplayVisualKey(row({ status: 'Booked', client_arrived_at: '2026-06-09T10:00:00' })),
    ).toBe('Arrived');
  });

  it('promotes Pending/Booked to Confirmed when attendance is confirmed', () => {
    expect(
      bookingDisplayVisualKey(row({ status: 'Pending', staff_attendance_confirmed_at: '2026-06-09T10:00:00' })),
    ).toBe('Confirmed');
    expect(
      bookingDisplayVisualKey(row({ status: 'Booked', guest_attendance_confirmed_at: '2026-06-09T10:00:00' })),
    ).toBe('Confirmed');
  });

  it('prefers the Arrived overlay over the attendance-confirmed promotion', () => {
    // Arrived is checked before the Pending/Booked attendance branch.
    expect(
      bookingDisplayVisualKey(
        row({
          status: 'Booked',
          client_arrived_at: '2026-06-09T10:00:00',
          staff_attendance_confirmed_at: '2026-06-09T10:05:00',
        }),
      ),
    ).toBe('Arrived');
  });

  it('defaults an unrecognised status to Booked', () => {
    expect(bookingDisplayVisualKey(row({ status: 'Weird' }))).toBe('Booked');
  });
});

describe('bookingCalendarBlockPalette', () => {
  it('resolves the calendar block through the display visual key', () => {
    // A Pending+arrived row should resolve to the Arrived block, not Pending's.
    const arrived = bookingCalendarBlockPalette(
      row({ status: 'Pending', client_arrived_at: '2026-06-09T10:00:00' }),
    );
    expect(arrived).toEqual(bookingStatusVisualForKey('Arrived').calendarBlock);
    expect(arrived.bg).toBe('#F59E0B');
  });

  it('returns the Seated block for a started booking', () => {
    expect(bookingCalendarBlockPalette(row({ status: 'Seated' }))).toEqual(
      bookingStatusVisualForKey('Seated').calendarBlock,
    );
  });
});
