import { resizeZoneGeometry } from '@/components/calendar/DraggableAppointmentBlock';
import { PX_PER_MINUTE } from '@/components/calendar/grid-layout';

/**
 * The duration control has to survive every bar height.
 *
 * Bar heights became true durations, so a 10-minute appointment is a 20px bar.
 * The resize affordance was gated at 28px, which silently removed the control
 * from everything under 15 minutes — the appointments most likely to need
 * adjusting. Reported from the app as "an appointment under 15 minutes loses the
 * duration slider".
 */

/** Bar height (px) for a booking of `mins` at the comfortable scale. */
const bar = (mins: number) => mins * PX_PER_MINUTE;

/** Every duration staff can actually produce, from the 5-minute floor up. */
const DURATIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120];

describe('resizeZoneGeometry', () => {
  it('offers a reachable resize target at every bookable duration', () => {
    // Asserted as a table so a failure says WHICH duration lost the control.
    const tooSmall = DURATIONS.filter((mins) => {
      const { zoneHeight, slopBelow } = resizeZoneGeometry(bar(mins));
      // What the finger actually gets: the strip in the bar plus the reach below.
      return zoneHeight + slopBelow < 12;
    });
    expect(tooSmall).toEqual([]);
  });

  it('always leaves room above the strip to grab the bar and move it', () => {
    const swallowed = DURATIONS.filter(
      (mins) => bar(mins) - resizeZoneGeometry(bar(mins)).zoneHeight < 6,
    );
    expect(swallowed).toEqual([]);
  });

  it('takes nothing from below once a bar can spare a full strip itself', () => {
    // A 15-minute bar (30px) is already big enough — no reach into the grid.
    expect(resizeZoneGeometry(bar(15)).slopBelow).toBe(0);
    expect(resizeZoneGeometry(bar(60)).slopBelow).toBe(0);
  });

  it('borrows from below exactly what a short bar lacks, never more', () => {
    const { zoneHeight, slopBelow } = resizeZoneGeometry(bar(5)); // 10px
    expect(zoneHeight + slopBelow).toBe(12);
    expect(slopBelow).toBeGreaterThan(0);
  });

  it('caps the strip so a tall bar is not mostly resize', () => {
    const tall = resizeZoneGeometry(bar(120)); // 240px
    expect(tall.zoneHeight).toBe(22);
    expect(tall.slopBelow).toBe(0);
  });

  it('never returns a negative zone for a degenerate bar', () => {
    for (const height of [0, 1, 6, 8]) {
      const { zoneHeight, slopBelow } = resizeZoneGeometry(height);
      expect(zoneHeight).toBeGreaterThanOrEqual(0);
      expect(zoneHeight).toBeLessThanOrEqual(Math.max(0, height));
      expect(slopBelow).toBeGreaterThanOrEqual(0);
    }
  });

  it('grows the strip monotonically with the bar', () => {
    let previous = -1;
    for (const mins of DURATIONS) {
      const { zoneHeight } = resizeZoneGeometry(bar(mins));
      expect(zoneHeight).toBeGreaterThanOrEqual(previous);
      previous = zoneHeight;
    }
  });
});
