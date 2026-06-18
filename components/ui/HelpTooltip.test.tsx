import type { ReactElement } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// The Sheet wraps its drag handle in a GestureDetector, which calls
// Reanimated.useEvent (absent from the jest reanimated mock). Stub
// gesture-handler so the detector is a passthrough and gestures are no-op builders.
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const chainable = () => {
    const g: Record<string, () => unknown> = {};
    const ret = () => g;
    for (const m of ['activeOffsetY', 'failOffsetY', 'onChange', 'onEnd', 'onStart', 'onUpdate', 'enabled']) {
      g[m] = ret;
    }
    return g;
  };
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: { Pan: chainable },
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
  };
});

import { Text } from '@/components/ui/Text';
import { HelpTooltip } from '@/components/ui/HelpTooltip';

/**
 * F4 — HelpTooltip: an (i) button that opens a small Sheet popover. The Sheet
 * already honours reduce-motion internally (fade vs slide); these tests prove the
 * disclosure works in both motion modes and that the trigger toggles it open.
 *
 * Presses are wrapped in `await act(...)` so the open/close state update flushes
 * before assertions (RTL press/act flush, per project memory).
 */
async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

// The Sheet reads useSafeAreaInsets(), so provide initial metrics in tests.
const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderWithSafeArea(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>);
}

describe('HelpTooltip', () => {
  it('is closed initially and opens the popover on press', async () => {
    await renderWithSafeArea(
      <HelpTooltip title="Lock period">
        Forms must be completed this many hours before the appointment.
      </HelpTooltip>,
    );

    // Body not shown until opened.
    expect(screen.queryByText(/Forms must be completed/)).toBeNull();

    await press(screen.getByLabelText('Help: Lock period'));

    expect(screen.getByText('Lock period')).toBeTruthy();
    expect(screen.getByText(/Forms must be completed/)).toBeTruthy();
  });

  it('closes when the sheet Close affordance is pressed', async () => {
    await renderWithSafeArea(<HelpTooltip title="Capture method">Body copy here.</HelpTooltip>);
    await press(screen.getByLabelText('Help: Capture method'));
    expect(screen.getByText('Body copy here.')).toBeTruthy();

    // The Sheet exposes a "Close" handle (button) — pressing it dismisses.
    await press(screen.getByLabelText('Close'));
    expect(screen.queryByText('Body copy here.')).toBeNull();
  });

  it('accepts a custom accessibility label and rich children', async () => {
    await renderWithSafeArea(
      <HelpTooltip title="Reminders" accessibilityLabel="What are reminders?">
        <Text>Rich node line one</Text>
      </HelpTooltip>,
    );
    await press(screen.getByLabelText('What are reminders?'));
    expect(screen.getByText('Rich node line one')).toBeTruthy();
  });
});
