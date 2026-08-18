import { render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

jest.mock('react-native-gesture-handler', () => {
  const ReactLib = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const chainable = (): Record<string, () => unknown> =>
    new Proxy({}, { get: () => () => chainable() }) as Record<string, () => unknown>;
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      ReactLib.createElement(View, null, children),
    Gesture: new Proxy({}, { get: () => () => chainable() }),
  };
});

import { CalendarDayGrid, type CalendarTimeBlock } from '@/components/calendar/CalendarDayGrid';
import { PX_PER_MINUTE, TIME_GUTTER_WIDTH } from '@/components/calendar/grid-layout';

/**
 * Closures had to be VISIBLE, and they had to stay out of the day's geometry.
 *
 * The grid measures its visible window from what it is given, so a full-day
 * closure band (00:00–23:59) would have stretched every day to midnight — the
 * same "an output cannot be an input" trap web hit with its generated stripes.
 * The band is therefore excluded when measuring and clipped when drawing.
 */

const workingHours = [{ start: '09:00', end: '17:00' }];

function leaveBand(): CalendarTimeBlock {
  return {
    id: 'practitioner_leave:cal-1:2026-08-24:0-1439',
    start: '00:00',
    end: '23:59',
    label: 'On leave — Annual leave',
    isEditable: false,
    blockType: 'practitioner_leave',
  };
}

/** Every hour label the gutter rendered, in order. */
function renderedHours(): string[] {
  return screen.getAllByText(/^\d{1,2}:\d{2}$/).map((node) => String(node.props.children));
}

async function renderGrid(timeBlocks: CalendarTimeBlock[] = []): Promise<void> {
  await render(
    <CalendarDayGrid
      bookings={[]}
      workingHours={workingHours}
      timeBlocks={timeBlocks}
      nowMinutes={null}
      onBlockPress={jest.fn()}
      onEmptyPress={jest.fn()}
      onBlockTimeBlockPress={jest.fn()}
    />,
  );
}

describe('CalendarDayGrid — closure bands', () => {
  it('draws a leave band with its own label rather than a generic "Blocked" box', async () => {
    await renderGrid([leaveBand()]);
    expect(screen.getByText('On leave — Annual leave')).toBeTruthy();
    expect(screen.queryByText(/Blocked/)).toBeNull();
  });

  it('does not let a full-day band stretch the day', async () => {
    await renderGrid([leaveBand()]);

    // The gutter still runs the working day. A 00:00–23:59 band fed into the
    // bounds would have pulled it out to midnight at both ends.
    const hours = renderedHours();
    expect(hours[0]).toBe('09:00');
    expect(hours[hours.length - 1]).toBe('17:00');
  });

  it('clips the band to the visible window instead of drawing off the top', async () => {
    await renderGrid([leaveBand()]);
    const band = screen.getByLabelText(/On leave/);
    const style = Object.assign(
      {},
      ...[band.props.style].flat(3).filter((s: unknown) => s && typeof s === 'object'),
    ) as { top: number; height: number };

    // Starts at the top of the rendered day, not at a negative offset…
    expect(style.top).toBe(0);
    // …and is a real span rather than 24 hours of pixels.
    expect(style.height).toBeGreaterThan(0);
    expect(style.height).toBeLessThanOrEqual(24 * 60 * PX_PER_MINUTE);
  });

  it('keeps the band clear of the time gutter', async () => {
    /**
     * Reported from staging: an amended-hours band ran underneath the hour
     * labels. This grid's canvas INCLUDES the gutter — unlike the column grids,
     * where a band is already inside its column — so a band positioned at
     * `left: 0` starts at the very edge of the screen instead of at the start
     * of the day's canvas.
     */
    await renderGrid([
      {
        id: 'venue_amended_hours:cal-1:2026-09-16:600-840',
        start: '10:00',
        end: '14:00',
        label: 'Amended hours',
        isEditable: false,
        blockType: 'venue_amended_hours',
      },
    ]);

    const band = screen.getByText('Amended hours').parent!;
    const style = Object.assign(
      {},
      ...[band.props.style].flat(3).filter((s: unknown) => s && typeof s === 'object'),
    ) as { left: number };
    expect(style.left).toBeGreaterThanOrEqual(TIME_GUTTER_WIDTH);
  });

  it('still shows a hand-made block as an editable "Blocked" overlay', async () => {
    // The closure look must not swallow the manual-block affordance.
    await renderGrid([
      {
        id: 'manual-1',
        start: '11:00',
        end: '12:00',
        label: null,
        isEditable: true,
        blockType: 'manual',
      },
    ]);
    expect(screen.getByText(/Blocked/)).toBeTruthy();
    expect(screen.getByText('Tap to edit')).toBeTruthy();
  });
});
