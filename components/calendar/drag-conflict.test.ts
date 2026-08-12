import { evaluateConflict } from '@/components/calendar/DraggableAppointmentBlock';

/**
 * The live conflict badge during a hold-drag: 0 valid, 1 outside working hours
 * (allowed, amber), 2 overlapping something (refused, red).
 *
 * Its self-exclusion rule is what this suite exists for. `busyRanges` is built
 * one entry per BOOKING ROW, and a merged multi-service visit is several rows
 * under one bar. Excluding only the row the bar is keyed on would have reported
 * the visit as clashing with its own next service the moment it was picked up:
 * the bar goes red, and the drop is refused, on a move that conflicts with
 * nothing.
 */
const working = [{ start: 9 * 60, end: 17 * 60 }];

/** A three-service visit at 10:00–11:30, plus somebody else's 12:00 booking. */
const busy = [
  { id: 'v1', start: 600, end: 630 },
  { id: 'v2', start: 630, end: 660 },
  { id: 'v3', start: 660, end: 690 },
  { id: 'other', start: 720, end: 780 },
];

describe('evaluateConflict', () => {
  it('clears a range that touches nothing', () => {
    expect(evaluateConflict(840, 870, ['v1'], busy, working)).toBe(0);
  });

  it('flags an overlap with somebody else', () => {
    expect(evaluateConflict(750, 780, ['v1'], busy, working)).toBe(2);
  });

  it('excludes every segment a visit bar owns', () => {
    // The whole visit moving 30 minutes later: 10:30–12:00 covers v2 and v3,
    // which are moving with it.
    expect(evaluateConflict(630, 720, ['v1', 'v2', 'v3'], busy, working)).toBe(0);
  });

  it('would have flagged that same move with only the lead excluded', () => {
    // The bug, pinned: this is what the bar did before it was told its siblings.
    expect(evaluateConflict(630, 720, ['v1'], busy, working)).toBe(2);
  });

  it('still sees a real clash while a visit is moving', () => {
    // Grown or dragged onto somebody else's 12:00, which is NOT part of the visit.
    expect(evaluateConflict(630, 750, ['v1', 'v2', 'v3'], busy, working)).toBe(2);
  });

  it('flags a range outside working hours as allowed-but-amber', () => {
    expect(evaluateConflict(8 * 60, 8 * 60 + 30, ['v1'], busy, working)).toBe(1);
  });

  it('treats an unknown working day as unrestricted', () => {
    expect(evaluateConflict(8 * 60, 8 * 60 + 30, ['v1'], busy, [])).toBe(0);
  });

  it('lets a range end exactly where the next starts', () => {
    // Half-open ranges: back-to-back is not an overlap, or every visit's own
    // services would collide with each other by definition.
    expect(evaluateConflict(690, 720, ['x'], busy, working)).toBe(0);
  });
});
