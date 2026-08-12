import { pickBlockLayout, pickTrayActions } from '@/components/calendar/AppointmentBlock';

describe('pickBlockLayout', () => {
  describe('mode selection (web parity: compact treatment below 56px)', () => {
    it('uses the horizontal row layout on short bars', () => {
      for (const h of [20, 32, 40, 55]) {
        expect(pickBlockLayout({ height: h, laneCount: 1 }).mode).toBe('row');
      }
    });

    it('uses the corner tray on tall bars', () => {
      for (const h of [56, 64, 90, 200]) {
        expect(pickBlockLayout({ height: h, laneCount: 1 }).mode).toBe('corner');
      }
    });
  });

  describe('row layout (short bars)', () => {
    it('budgets buttons AFTER the name reserve when the px width is known', () => {
      // Web-parity phone column (256px): reserve 58 for the name, the rest
      // fits both actions.
      expect(pickBlockLayout({ height: 40, laneCount: 1, widthPx: 256 }).maxActions).toBe(2);
      // Old 168px column: only the primary fits beside the name.
      expect(pickBlockLayout({ height: 40, laneCount: 1, widthPx: 168 }).maxActions).toBe(1);
      // A half-lane (84px): name-only — the name is never squeezed out.
      expect(pickBlockLayout({ height: 40, laneCount: 2, widthPx: 84 }).maxActions).toBe(0);
    });

    it('falls back to the overlap-lane hint when the width is unknown', () => {
      expect(pickBlockLayout({ height: 40, laneCount: 1 }).maxActions).toBe(2);
      expect(pickBlockLayout({ height: 40, laneCount: 2 }).maxActions).toBe(1);
      expect(pickBlockLayout({ height: 40, laneCount: 4 }).maxActions).toBe(1);
    });

    it('tracks the bar height for buttons: inset by 6, floored 14, capped 22', () => {
      expect(pickBlockLayout({ height: 20, laneCount: 1 }).buttonHeight).toBe(14);
      expect(pickBlockLayout({ height: 26, laneCount: 1 }).buttonHeight).toBe(20);
      expect(pickBlockLayout({ height: 40, laneCount: 1 }).buttonHeight).toBe(22); // cap
    });

    it('leaves a button room to sit inside the bar it is drawn in', () => {
      // The regression this guards: bar heights are now true durations, so a
      // short bar is genuinely short. A button taller than its bar gets sliced
      // by the card's overflow:hidden and reads as broken.
      for (const height of [20, 24, 30, 40, 55]) {
        const { buttonHeight, maxActions } = pickBlockLayout({ height, laneCount: 1 });
        if (maxActions > 0) expect(buttonHeight + 2).toBeLessThanOrEqual(height);
      }
    });

    it('drops the actions entirely on a bar too short to draw one', () => {
      // Sub-10-minute bookings: the name alone, rather than a clipped control.
      expect(pickBlockLayout({ height: 19, laneCount: 1 }).maxActions).toBe(0);
      expect(pickBlockLayout({ height: 14, laneCount: 1 }).maxActions).toBe(0);
      // …and the threshold is not so eager that it strips a 15-minute bar (30px).
      expect(pickBlockLayout({ height: 30, laneCount: 1 }).maxActions).toBeGreaterThan(0);
    });

    it('shrinks the NAME font only on the very short bars (web thresholds)', () => {
      expect(pickBlockLayout({ height: 20, laneCount: 1 }).nameFontSize).toBe(10);
      expect(pickBlockLayout({ height: 28, laneCount: 1 }).nameFontSize).toBe(12);
      expect(pickBlockLayout({ height: 40, laneCount: 1 }).nameFontSize).toBe(13);
    });

    it('exposes no button font size — width must never vary with bar height', () => {
      // The label font + horizontal padding are style constants; only the
      // button HEIGHT tracks the bar (web rule: compress height, never width).
      expect('buttonFontSize' in pickBlockLayout({ height: 20, laneCount: 1 })).toBe(false);
    });

    it('adds the service row once the bar affords two rows', () => {
      expect(pickBlockLayout({ height: 40, laneCount: 1 }).rows).toBe(1);
      expect(pickBlockLayout({ height: 44, laneCount: 1 }).rows).toBe(2);
    });

    it('shows no actions when the block has none', () => {
      expect(pickBlockLayout({ height: 40, laneCount: 1, hasActions: false }).maxActions).toBe(0);
    });
  });

  describe('corner layout (tall bars)', () => {
    it('budgets actions from the px width when known', () => {
      expect(pickBlockLayout({ height: 90, laneCount: 1, widthPx: 240 }).maxActions).toBe(2);
      expect(pickBlockLayout({ height: 90, laneCount: 3, widthPx: 80 }).maxActions).toBe(1);
      expect(pickBlockLayout({ height: 90, laneCount: 3, widthPx: 56 }).maxActions).toBe(0);
    });

    it('falls back to the lane heuristic when the width is unknown', () => {
      expect(pickBlockLayout({ height: 90, laneCount: 1 }).maxActions).toBe(2);
      expect(pickBlockLayout({ height: 90, laneCount: 2 }).maxActions).toBe(2);
      expect(pickBlockLayout({ height: 90, laneCount: 3 }).maxActions).toBe(1);
    });

    it('budgets text rows against the tray reserve so no row clips under it', () => {
      // With a tray: the reserve eats 24px before the row thresholds apply.
      expect(pickBlockLayout({ height: 56, laneCount: 1 }).rows).toBe(1);
      expect(pickBlockLayout({ height: 60, laneCount: 1 }).rows).toBe(2);
      expect(pickBlockLayout({ height: 74, laneCount: 1 }).rows).toBe(3);
      expect(pickBlockLayout({ height: 96, laneCount: 1 }).rows).toBe(4);
    });

    it('gives the text the full height when there is no tray', () => {
      expect(pickBlockLayout({ height: 56, laneCount: 1, hasActions: false }).rows).toBe(3);
      expect(pickBlockLayout({ height: 72, laneCount: 1, hasActions: false }).rows).toBe(4);
    });

    it('keeps the fixed tray metrics (buttons never shrink on tall bars)', () => {
      const layout = pickBlockLayout({ height: 120, laneCount: 1 });
      expect(layout.buttonHeight).toBe(22);
      expect(layout.nameFontSize).toBe(13);
    });
  });
});

describe('pickTrayActions', () => {
  const labels = (a: { label: string }[]) => a.map((x) => x.label);

  it('returns the status action alone when only one fits (keep-tail rule)', () => {
    expect(labels(pickTrayActions({ status: 'Booked', max: 1 }))).toEqual(['Start']);
    // "Accept" on a Pending booking (web D9) — Confirm is the attendance action.
    expect(labels(pickTrayActions({ status: 'Pending', max: 1 }))).toEqual(['Accept']);
  });

  it('returns the arrived toggle + status action when two fit', () => {
    expect(labels(pickTrayActions({ status: 'Booked', max: 2 }))).toEqual(['Arrived', 'Start']);
    expect(labels(pickTrayActions({ status: 'Pending', max: 2 }))).toEqual(['Arrived', 'Accept']);
  });

  it('swaps Arrived → Clear once the guest has arrived', () => {
    expect(
      labels(pickTrayActions({ status: 'Booked', clientArrivedAt: '2026-06-14T10:00:00Z', max: 2 })),
    ).toEqual(['Clear', 'Start']);
  });

  it('offers Undo + Complete on a seated booking, Complete alone when one fits', () => {
    expect(labels(pickTrayActions({ status: 'Seated', max: 2 }))).toEqual(['Undo', 'Complete']);
    expect(labels(pickTrayActions({ status: 'Seated', max: 1 }))).toEqual(['Complete']);
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
