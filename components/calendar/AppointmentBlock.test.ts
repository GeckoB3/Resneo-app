import {
  pickBlockLayout,
  pickTrayActions,
  planBlockText,
  segmentLabelRows,
  shortGuestName,
} from '@/components/calendar/AppointmentBlock';

describe('pickBlockLayout', () => {
  describe('lines (2026-11-18: 15px lines below a 4px top inset)', () => {
    it('fits one line below 34px, two from 34, three from 49 and the status line from 69', () => {
      const rows = (height: number) => pickBlockLayout({ height, laneCount: 1 }).rows;
      expect(rows(26)).toBe(1); // a 15-minute bar at the normal size
      expect(rows(33)).toBe(1);
      expect(rows(34)).toBe(2);
      expect(rows(36)).toBe(2); // a 20-minute bar
      expect(rows(49)).toBe(3);
      expect(rows(56)).toBe(3); // a 30-minute bar
      expect(rows(69)).toBe(4);
      expect(rows(86)).toBe(4); // a 45-minute bar
    });

    it('counts the lines whether or not the bar has buttons: a line may run beside the tray', () => {
      expect(pickBlockLayout({ height: 56, laneCount: 1, hasActions: true }).rows).toBe(3);
      expect(pickBlockLayout({ height: 56, laneCount: 1, hasActions: false }).rows).toBe(3);
    });

    it('uses one type size for the name on every bar that holds a full line', () => {
      for (const height of [15, 26, 40, 56, 120]) {
        expect(pickBlockLayout({ height, laneCount: 1 }).nameFontSize).toBe(12);
      }
      expect(pickBlockLayout({ height: 12, laneCount: 1 }).nameFontSize).toBe(11);
    });
  });

  describe('one-line bars (the row layout)', () => {
    it('lays a one-line bar out as a row and anything taller in the corner layout', () => {
      expect(pickBlockLayout({ height: 26, laneCount: 1 }).mode).toBe('row');
      expect(pickBlockLayout({ height: 36, laneCount: 1 }).mode).toBe('corner');
    });

    it('keeps one button, the next step, after the name reserve', () => {
      expect(pickBlockLayout({ height: 26, laneCount: 1, widthPx: 256 }).maxActions).toBe(1);
      expect(pickBlockLayout({ height: 26, laneCount: 1 }).maxActions).toBe(1);
      // A half-lane (84px): name only, the name is never squeezed out.
      expect(pickBlockLayout({ height: 26, laneCount: 2, widthPx: 84 }).maxActions).toBe(0);
    });

    it('tracks the bar height for buttons: inset by 6, floored 14, capped 22', () => {
      expect(pickBlockLayout({ height: 20, laneCount: 1 }).buttonHeight).toBe(14);
      expect(pickBlockLayout({ height: 26, laneCount: 1 }).buttonHeight).toBe(20);
      expect(pickBlockLayout({ height: 33, laneCount: 1 }).buttonHeight).toBe(22); // cap
    });

    it('leaves a button room to sit inside the bar it is drawn in', () => {
      for (const height of [20, 24, 30, 33]) {
        const { buttonHeight, maxActions } = pickBlockLayout({ height, laneCount: 1 });
        if (maxActions > 0) expect(buttonHeight + 2).toBeLessThanOrEqual(height);
      }
    });

    it('drops the actions entirely on a bar too short to draw one', () => {
      expect(pickBlockLayout({ height: 19, laneCount: 1 }).maxActions).toBe(0);
      expect(pickBlockLayout({ height: 14, laneCount: 1 }).maxActions).toBe(0);
      // …and the threshold is not so eager that it strips a 15-minute bar.
      expect(pickBlockLayout({ height: 26, laneCount: 1 }).maxActions).toBeGreaterThan(0);
    });

    it('exposes no button font size: width must never vary with bar height', () => {
      expect('buttonFontSize' in pickBlockLayout({ height: 20, laneCount: 1 })).toBe(false);
    });

    it('shows no actions when the block has none', () => {
      expect(pickBlockLayout({ height: 26, laneCount: 1, hasActions: false }).maxActions).toBe(0);
    });
  });

  describe('taller bars (the corner layout)', () => {
    it('keeps one button on a two-line bar, and a slightly shorter one', () => {
      const layout = pickBlockLayout({ height: 36, laneCount: 1, widthPx: 240 });
      expect(layout.maxActions).toBe(1);
      expect(layout.buttonHeight).toBe(20);
    });

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

    it('keeps the fixed tray metrics on tall bars', () => {
      const layout = pickBlockLayout({ height: 120, laneCount: 1 });
      expect(layout.buttonHeight).toBe(22);
      expect(layout.nameFontSize).toBe(12);
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

describe('planBlockText', () => {
  const base = { guestName: 'Ada Lovelace', serviceName: 'Cut & finish', timeLabel: '10:00–10:30' };

  it('writes "Name · Service · time" on one wide line', () => {
    expect(planBlockText({ ...base, rows: 1, lineWidthsPx: [300] })).toEqual({
      name: 'Ada Lovelace',
      tail: ' · Cut & finish · 10:00–10:30',
      lines: [],
    });
  });

  it('leaves the time off a one-line bar rather than cut it in half', () => {
    expect(planBlockText({ ...base, rows: 1, lineWidthsPx: [180] }).tail).toBe(' · Cut & finish');
  });

  it('puts the service then the time under the name on two lines', () => {
    expect(planBlockText({ ...base, rows: 2, lineWidthsPx: [220] }).lines).toEqual([
      { service: 'Cut & finish', time: '10:00–10:30' },
    ]);
  });

  it('leaves the time off a narrow second line rather than squeeze the service out', () => {
    // 120px: " · 10:00–10:30" takes ~89px, leaving under the 48px a service needs.
    expect(planBlockText({ ...base, rows: 2, lineWidthsPx: [220, 120] }).lines).toEqual([
      { service: 'Cut & finish' },
    ]);
  });

  it('gives the service and the time a line each when there is room', () => {
    expect(planBlockText({ ...base, rows: 3, lineWidthsPx: [220] }).lines).toEqual([
      { service: 'Cut & finish' },
      { time: '10:00–10:30' },
    ]);
  });

  it('shows the time alone when the booking has no service name', () => {
    expect(planBlockText({ ...base, serviceName: '', rows: 1, lineWidthsPx: [300] }).tail).toBe(
      ' · 10:00–10:30',
    );
    expect(planBlockText({ ...base, serviceName: null, rows: 2, lineWidthsPx: [300] }).lines).toEqual([
      { time: '10:00–10:30' },
    ]);
    expect(planBlockText({ ...base, serviceName: undefined, rows: 3, lineWidthsPx: [300] }).lines).toEqual([
      { time: '10:00–10:30' },
    ]);
  });

  it('shortens a name too long for its line to first name and initial', () => {
    const long = { ...base, guestName: 'Alexandra Fitzgerald', rows: 3 };
    expect(planBlockText({ ...long, lineWidthsPx: [90] }).name).toBe('Alexandra F.');
    expect(planBlockText({ ...long, lineWidthsPx: [220] }).name).toBe('Alexandra Fitzgerald');
  });
});

describe('shortGuestName', () => {
  it('keeps the first name and the surname initial, and leaves one word alone', () => {
    expect(shortGuestName('Alexandra Fitzgerald')).toBe('Alexandra F.');
    expect(shortGuestName("Hannah o'neill")).toBe('Hannah O.');
    expect(shortGuestName('Cher')).toBe('Cher');
  });
});

describe('segmentLabelRows', () => {
  it('writes one, two or three 15px lines on a later service of a visit', () => {
    expect(segmentLabelRows(14)).toBe(0);
    expect(segmentLabelRows(15)).toBe(1);
    expect(segmentLabelRows(33)).toBe(2);
    expect(segmentLabelRows(48)).toBe(3);
  });
});
