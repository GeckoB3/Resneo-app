import { render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

/**
 * The bars are wrapped in a GestureDetector, whose `useAnimatedGesture` needs
 * Reanimated's `useEvent` — absent from the project's lightweight Reanimated
 * mock (see jest.setup.js). This suite is about geometry, not gestures, so the
 * detector is reduced to a passthrough and the gesture builders to no-op chains.
 */
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

import { CalendarDayGrid } from '@/components/calendar/CalendarDayGrid';
import { PX_PER_MINUTE } from '@/components/calendar/grid-layout';
import type { CalendarGridBooking } from '@/types/calendar-grid';

/**
 * The device-reported bug, driven through the real grid rather than the layout
 * helper alone: "two bookings with a duration of 15 minutes visually overlap
 * slightly".
 *
 * Cause was a 40px visual floor on a bar that is only 30px of real time at
 * 2px/min, so each short bar was painted 10px into the one below it. The grid
 * is what has to keep the promise, so the assertion is made on the geometry the
 * grid actually renders: bar bottom <= next bar top, for every adjacent pair.
 */

function booking(id: string, startTime: string, endTime: string): CalendarGridBooking {
  return {
    id,
    startTime,
    endTime,
    guestName: `Guest ${id}`,
    serviceName: 'Fringe trim',
    status: 'Booked',
  };
}

/** The rendered top/height of each appointment bar, in document order. */
function renderedBars() {
  return screen
    .getAllByLabelText(/Guest/)
    .map((node) => {
      // The positioned wrapper owns top/height; the block itself fills it.
      let current: typeof node | null = node;
      for (let depth = 0; current && depth < 6; depth += 1) {
        const style = StyleSheet_flatten(current.props?.style);
        if (style && typeof style.top === 'number' && typeof style.height === 'number') {
          return { top: style.top, height: style.height };
        }
        current = current.parent;
      }
      return null;
    })
    .filter((v): v is { top: number; height: number } => v != null);
}

/** Minimal style flattener — RN's own needs the runtime, this needs plain objects. */
function StyleSheet_flatten(style: unknown): Record<string, unknown> | null {
  if (!style) return null;
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, part) => ({ ...acc, ...(StyleSheet_flatten(part) ?? {}) }),
      {},
    );
  }
  return typeof style === 'object' ? (style as Record<string, unknown>) : null;
}

const workingHours = [{ start: '09:00', end: '17:00' }];

describe('CalendarDayGrid — short bookings keep to their own time', () => {
  it('does not let back-to-back 15-minute bars overlap', async () => {
    await render(
      <CalendarDayGrid
        bookings={[booking('a', '10:00', '10:15'), booking('b', '10:15', '10:30')]}
        workingHours={workingHours}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );

    const bars = renderedBars().sort((x, y) => x.top - y.top);
    expect(bars).toHaveLength(2);
    // Each bar is exactly its 15 minutes…
    expect(bars[0].height).toBe(15 * PX_PER_MINUTE);
    expect(bars[1].height).toBe(15 * PX_PER_MINUTE);
    // …so the first ends precisely where the second begins.
    expect(bars[0].top + bars[0].height).toBeLessThanOrEqual(bars[1].top);
  });

  it('keeps a run of short bookings within their slots', async () => {
    await render(
      <CalendarDayGrid
        bookings={[
          booking('a', '09:00', '09:15'),
          booking('b', '09:15', '09:30'),
          booking('c', '09:30', '09:45'),
          booking('d', '09:45', '10:00'),
        ]}
        workingHours={workingHours}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );

    const bars = renderedBars().sort((x, y) => x.top - y.top);
    expect(bars).toHaveLength(4);
    for (let i = 0; i < bars.length - 1; i += 1) {
      expect(bars[i].top + bars[i].height).toBeLessThanOrEqual(bars[i + 1].top);
    }
  });

  it('still gives a normal appointment its full height', async () => {
    await render(
      <CalendarDayGrid
        bookings={[booking('a', '10:00', '11:00')]}
        workingHours={workingHours}
        nowMinutes={null}
        onBlockPress={jest.fn()}
        onEmptyPress={jest.fn()}
      />,
    );
    expect(renderedBars()[0].height).toBe(60 * PX_PER_MINUTE);
  });
});
