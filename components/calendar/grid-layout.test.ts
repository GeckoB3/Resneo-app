import {
  DEFAULT_END_HOUR,
  DEFAULT_START_HOUR,
  DRAG_SNAP_MINUTES,
  MIN_BLOCK_HEIGHT,
  PX_PER_MINUTE,
  SLOT_MINUTES,
  TAP_SNAP_MINUTES,
  TIME_GUTTER_WIDTH,
  computeGridBounds,
  computeLaneLayouts,
  hourLabel,
  minutesToTime,
  timeToMinutes,
  type LaneInput,
} from '@/components/calendar/grid-layout';

// ---------------------------------------------------------------------------
// Layout constants — these feed every px conversion below, so pin their values.
// ---------------------------------------------------------------------------
describe('layout constants', () => {
  it('uses 2px per minute (120px/hour) for the vertical scale', () => {
    expect(PX_PER_MINUTE).toBe(2);
    // A 1h block is 60min * 2px = 120px tall.
    expect(60 * PX_PER_MINUTE).toBe(120);
  });

  it('exposes the grid/snap granularities and gutter width', () => {
    expect(SLOT_MINUTES).toBe(30);
    expect(TIME_GUTTER_WIDTH).toBe(56);
    expect(MIN_BLOCK_HEIGHT).toBe(36);
    expect(TAP_SNAP_MINUTES).toBe(15);
    expect(DRAG_SNAP_MINUTES).toBe(5);
  });

  it('defaults the day window to 08:00–20:00', () => {
    expect(DEFAULT_START_HOUR).toBe(8);
    expect(DEFAULT_END_HOUR).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// timeToMinutes — "HH:mm[:ss]" → minutes since midnight.
// ---------------------------------------------------------------------------
describe('timeToMinutes', () => {
  it('parses HH:mm to minutes since midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('08:00')).toBe(480);
    expect(timeToMinutes('14:30')).toBe(870);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('ignores a trailing :ss component', () => {
    expect(timeToMinutes('14:30:00')).toBe(870);
    expect(timeToMinutes('09:15:45')).toBe(555);
  });

  it('treats a missing minute component as :00', () => {
    expect(timeToMinutes('14')).toBe(840);
    expect(timeToMinutes('14:')).toBe(840);
  });

  it('does NOT clamp values past the end of day', () => {
    // No upper bound here — clamping is minutesToTime's job, not this one.
    expect(timeToMinutes('24:00')).toBe(1440);
    expect(timeToMinutes('25:30')).toBe(1530);
  });

  it('returns 0 for non-numeric/malformed times', () => {
    expect(timeToMinutes('abc')).toBe(0);
    expect(timeToMinutes('aa:bb')).toBe(0);
    expect(timeToMinutes('12:bb')).toBe(0);
    // Empty string: Number('') === 0, so this falls through to 0 rather than NaN.
    expect(timeToMinutes('')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// minutesToTime — minutes since midnight → "HH:mm", clamped to [0, 1439].
// ---------------------------------------------------------------------------
describe('minutesToTime', () => {
  it('formats minutes as zero-padded HH:mm', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(480)).toBe('08:00');
    expect(minutesToTime(870)).toBe('14:30');
    expect(minutesToTime(1439)).toBe('23:59');
  });

  it('rounds fractional minutes to the nearest minute', () => {
    expect(minutesToTime(870.4)).toBe('14:30');
    expect(minutesToTime(870.6)).toBe('14:31');
  });

  it('clamps below 0 to 00:00', () => {
    expect(minutesToTime(-1)).toBe('00:00');
    expect(minutesToTime(-120)).toBe('00:00');
  });

  it('clamps the grid edge: 24:00 and beyond pin to 23:59', () => {
    expect(minutesToTime(1440)).toBe('23:59');
    expect(minutesToTime(2000)).toBe('23:59');
  });

  it('round-trips with timeToMinutes for in-range times', () => {
    for (const t of ['00:00', '08:15', '12:00', '17:45', '23:59']) {
      expect(minutesToTime(timeToMinutes(t))).toBe(t);
    }
  });
});

// ---------------------------------------------------------------------------
// hourLabel — gutter label for an hour line.
// ---------------------------------------------------------------------------
describe('hourLabel', () => {
  it('renders a zero-padded HH:00 label', () => {
    expect(hourLabel(0)).toBe('00:00');
    expect(hourLabel(8)).toBe('08:00');
    expect(hourLabel(20)).toBe('20:00');
  });
});

// ---------------------------------------------------------------------------
// computeGridBounds — smallest hour window containing every range.
// ---------------------------------------------------------------------------
describe('computeGridBounds', () => {
  it('falls back to the default window when there are no ranges', () => {
    expect(computeGridBounds([])).toEqual({
      startHour: DEFAULT_START_HOUR,
      endHour: DEFAULT_END_HOUR,
    });
  });

  it('floors the start hour and ceils the end hour', () => {
    // 09:00–10:00 sits exactly on hour lines.
    expect(computeGridBounds([{ start: 540, end: 600 }])).toEqual({
      startHour: 9,
      endHour: 10,
    });
    // 09:15–10:05 must expand outward to 09:00–11:00.
    expect(computeGridBounds([{ start: 555, end: 605 }])).toEqual({
      startHour: 9,
      endHour: 11,
    });
  });

  it('spans the union of multiple ranges', () => {
    expect(
      computeGridBounds([
        { start: 600, end: 660 }, // 10:00–11:00
        { start: 900, end: 1020 }, // 15:00–17:00
        { start: 480, end: 540 }, // 08:00–09:00
      ]),
    ).toEqual({ startHour: 8, endHour: 17 });
  });

  it('guarantees the window is at least one hour tall for a zero-length range', () => {
    // start == end on an exact hour would otherwise yield startHour === endHour.
    expect(computeGridBounds([{ start: 600, end: 600 }])).toEqual({
      startHour: 10,
      endHour: 11,
    });
  });

  it('clamps to the [0, 24] hour grid at the edges', () => {
    // Past midnight: 23:00–25:00 → end ceils to 24, not 25.
    expect(computeGridBounds([{ start: 1380, end: 1500 }])).toEqual({
      startHour: 23,
      endHour: 24,
    });
    // Negative start floors to 0, not below.
    expect(computeGridBounds([{ start: -60, end: 60 }])).toEqual({
      startHour: 0,
      endHour: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// computeLaneLayouts — overlapping blocks split into side-by-side lanes.
// Inputs are px extents (top/bottom) measured from the grid top.
// ---------------------------------------------------------------------------
describe('computeLaneLayouts', () => {
  it('returns an empty map for no items', () => {
    expect(computeLaneLayouts([]).size).toBe(0);
  });

  it('gives a lone block the full width (1 lane)', () => {
    const layout = computeLaneLayouts([{ id: 'a', top: 0, bottom: 120 }]);
    expect(layout.get('a')).toEqual({ laneIndex: 0, laneCount: 1 });
  });

  it('splits two overlapping blocks into two lanes', () => {
    // a: 0–120, b: 60–180 overlap by 60px.
    const layout = computeLaneLayouts([
      { id: 'a', top: 0, bottom: 120 },
      { id: 'b', top: 60, bottom: 180 },
    ]);
    expect(layout.get('a')).toEqual({ laneIndex: 0, laneCount: 2 });
    expect(layout.get('b')).toEqual({ laneIndex: 1, laneCount: 2 });
  });

  it('does NOT split adjacent (edge-touching) blocks', () => {
    // a ends exactly where b begins (120) — back-to-back, not overlapping.
    const layout = computeLaneLayouts([
      { id: 'a', top: 0, bottom: 120 },
      { id: 'b', top: 120, bottom: 240 },
    ]);
    expect(layout.get('a')).toEqual({ laneIndex: 0, laneCount: 1 });
    expect(layout.get('b')).toEqual({ laneIndex: 0, laneCount: 1 });
  });

  it('does NOT split blocks separated by a gap', () => {
    const layout = computeLaneLayouts([
      { id: 'a', top: 0, bottom: 100 },
      { id: 'b', top: 200, bottom: 300 },
    ]);
    expect(layout.get('a')).toEqual({ laneIndex: 0, laneCount: 1 });
    expect(layout.get('b')).toEqual({ laneIndex: 0, laneCount: 1 });
  });

  it('packs three mutually overlapping blocks into three lanes', () => {
    const layout = computeLaneLayouts([
      { id: 'a', top: 0, bottom: 180 },
      { id: 'b', top: 30, bottom: 150 },
      { id: 'c', top: 60, bottom: 120 },
    ]);
    expect(layout.get('a')).toEqual({ laneIndex: 0, laneCount: 3 });
    expect(layout.get('b')).toEqual({ laneIndex: 1, laneCount: 3 });
    expect(layout.get('c')).toEqual({ laneIndex: 2, laneCount: 3 });
  });

  it('reuses a freed lane for a later non-overlapping block in the same cluster', () => {
    // a:0–50 frees lane 0 before c:60–120 starts; b:0–100 bridges them into one
    // cluster, so all three share laneCount 2 and c takes a's old lane 0.
    const layout = computeLaneLayouts([
      { id: 'a', top: 0, bottom: 50 },
      { id: 'b', top: 0, bottom: 100 },
      { id: 'c', top: 60, bottom: 120 },
    ]);
    expect(layout.get('a')).toEqual({ laneIndex: 0, laneCount: 2 });
    expect(layout.get('b')).toEqual({ laneIndex: 1, laneCount: 2 });
    expect(layout.get('c')).toEqual({ laneIndex: 0, laneCount: 2 });
  });

  it('treats a transitively-overlapping chain as one cluster', () => {
    // a–b overlap, b–c overlap, but a–c do not. b bridges them: one 2-lane cluster.
    const layout = computeLaneLayouts([
      { id: 'a', top: 0, bottom: 100 },
      { id: 'b', top: 50, bottom: 200 },
      { id: 'c', top: 150, bottom: 250 },
    ]);
    expect(layout.get('a')).toEqual({ laneIndex: 0, laneCount: 2 });
    expect(layout.get('b')).toEqual({ laneIndex: 1, laneCount: 2 });
    expect(layout.get('c')).toEqual({ laneIndex: 0, laneCount: 2 });
  });

  it('keeps two separate clusters independent (resets lane count between them)', () => {
    const layout = computeLaneLayouts([
      // Cluster 1: a & b overlap → 2 lanes.
      { id: 'a', top: 0, bottom: 100 },
      { id: 'b', top: 50, bottom: 150 },
      // Cluster 2: a lone block well below → back to 1 lane.
      { id: 'c', top: 400, bottom: 500 },
    ]);
    expect(layout.get('a')).toEqual({ laneIndex: 0, laneCount: 2 });
    expect(layout.get('b')).toEqual({ laneIndex: 1, laneCount: 2 });
    expect(layout.get('c')).toEqual({ laneIndex: 0, laneCount: 1 });
  });

  it('is independent of input ordering', () => {
    const items: LaneInput[] = [
      { id: 'c', top: 60, bottom: 120 },
      { id: 'a', top: 0, bottom: 180 },
      { id: 'b', top: 30, bottom: 150 },
    ];
    const forward = computeLaneLayouts(items);
    const reversed = computeLaneLayouts([...items].reverse());
    for (const id of ['a', 'b', 'c']) {
      expect(reversed.get(id)).toEqual(forward.get(id));
    }
  });

  it('handles a zero-length block: it shares no lane with an adjacent block', () => {
    // A zero-height block at 120 touches (but does not overlap) a:0–120 or b:120–240.
    const layout = computeLaneLayouts([
      { id: 'a', top: 0, bottom: 120 },
      { id: 'zero', top: 120, bottom: 120 },
      { id: 'b', top: 120, bottom: 240 },
    ]);
    // None overlap (all edges touch), so every block stays full width.
    expect(layout.get('a')).toEqual({ laneIndex: 0, laneCount: 1 });
    expect(layout.get('zero')).toEqual({ laneIndex: 0, laneCount: 1 });
    expect(layout.get('b')).toEqual({ laneIndex: 0, laneCount: 1 });
  });

  it('splits a zero-length block that lands inside another block', () => {
    // zero at 60 falls strictly inside a:0–120 → they overlap → 2 lanes.
    const layout = computeLaneLayouts([
      { id: 'a', top: 0, bottom: 120 },
      { id: 'zero', top: 60, bottom: 60 },
    ]);
    expect(layout.get('a')).toEqual({ laneIndex: 0, laneCount: 2 });
    expect(layout.get('zero')).toEqual({ laneIndex: 1, laneCount: 2 });
  });
});
