import { pickBlockDensity, pickTrayActions } from '@/components/calendar/AppointmentBlock';

describe('pickBlockDensity', () => {
  it('shows the action tray on every block at/above the grid min height', () => {
    // MIN_BLOCK_HEIGHT is 40, so even the shortest real block gets a tray.
    for (const h of [40, 50, 64, 90, 120]) {
      expect(pickBlockDensity(h, 1).trayActions).toBeGreaterThan(0);
    }
  });

  it('does NOT gate the second action by height — full width shows 2 at any height', () => {
    expect(pickBlockDensity(36, 1).trayActions).toBe(2);
    expect(pickBlockDensity(40, 1).trayActions).toBe(2);
    expect(pickBlockDensity(120, 1).trayActions).toBe(2);
  });

  it('gates the action COUNT by width (lane count), not height', () => {
    expect(pickBlockDensity(90, 1).trayActions).toBe(2); // full width
    expect(pickBlockDensity(90, 2).trayActions).toBe(2); // half width still fits two
    expect(pickBlockDensity(90, 3).trayActions).toBe(1); // 3 lanes → primary only
    expect(pickBlockDensity(90, 4).trayActions).toBe(1);
  });

  it('hides the tray only below the minimum (e.g. a block shrunk mid-resize)', () => {
    expect(pickBlockDensity(20, 1).trayActions).toBe(0);
    expect(pickBlockDensity(31, 1).trayActions).toBe(0);
    expect(pickBlockDensity(32, 1).trayActions).toBe(2);
  });

  it('grows text rows with available height', () => {
    expect(pickBlockDensity(36, 1).rows).toBe(1);
    expect(pickBlockDensity(50, 1).rows).toBe(2);
    expect(pickBlockDensity(64, 1).rows).toBe(3);
    expect(pickBlockDensity(80, 1).rows).toBe(4);
  });
});

describe('pickTrayActions', () => {
  const labels = (a: { label: string }[]) => a.map((x) => x.label);

  it('returns the status action alone when only one fits', () => {
    expect(labels(pickTrayActions({ status: 'Booked', max: 1 }))).toEqual(['Start']);
    expect(labels(pickTrayActions({ status: 'Pending', max: 1 }))).toEqual(['Confirm']);
  });

  it('returns the arrived toggle + status action when two fit', () => {
    expect(labels(pickTrayActions({ status: 'Booked', max: 2 }))).toEqual(['Arrived', 'Start']);
    expect(labels(pickTrayActions({ status: 'Pending', max: 2 }))).toEqual(['Arrived', 'Confirm']);
  });

  it('swaps Arrived → Clear once the guest has arrived', () => {
    expect(
      labels(pickTrayActions({ status: 'Booked', clientArrivedAt: '2026-06-14T10:00:00Z', max: 2 })),
    ).toEqual(['Clear', 'Start']);
  });

  it('offers Undo + Complete on a seated booking', () => {
    expect(labels(pickTrayActions({ status: 'Seated', max: 2 }))).toEqual(['Undo', 'Complete']);
  });

  it('offers Reopen on completed, nothing on terminal states', () => {
    expect(labels(pickTrayActions({ status: 'Completed', max: 2 }))).toEqual(['Reopen']);
    expect(pickTrayActions({ status: 'Cancelled', max: 2 })).toEqual([]);
    expect(pickTrayActions({ status: 'No-Show', max: 2 })).toEqual([]);
  });

  it('returns nothing when no actions fit', () => {
    expect(pickTrayActions({ status: 'Booked', max: 0 })).toEqual([]);
  });
});
