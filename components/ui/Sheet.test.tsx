/**
 * Sheet — the app's one Modal-based bottom sheet.
 *
 * Pinned here is the bottom inset, because it has bitten twice and is invisible
 * from a simulator-less desk:
 *
 *  - the safe area is PADDING driven by the SafeAreaProvider, not a native
 *    <SafeAreaView>. Sheets live in their own Modal window, and a sheet opened
 *    from inside another sheet (booking detail → Modify) is a Modal within a
 *    Modal, where the native view measures no safe area and contributes 0 —
 *    dropping the pinned action row onto the home indicator;
 *  - `fill` sheets get a margin of their own on top of that inset. They used to
 *    get zero, so their pinned Save/Cancel row sat hard on the boundary.
 *
 * Content-sized sheets must stay byte-identical to the old layout (lg + inset).
 */
import { render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';

import { Sheet } from './Sheet';
import { spacing } from '@/theme/index';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// The drag-to-dismiss gesture needs reanimated's worklet runtime, which is not
// initialised under jest-expo. The sheet's layout doesn't depend on it.
jest.mock('react-native-gesture-handler', () => {
  const builder: Record<string, () => unknown> = {};
  for (const m of ['activeOffsetY', 'failOffsetY', 'onChange', 'onEnd']) {
    builder[m] = () => builder;
  }
  return {
    Gesture: { Pan: () => builder },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

const mockInsets = { top: 47, bottom: 34, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));

jest.mock('@/providers/AppLockProvider', () => ({ AppLockCover: () => null }));

function flatten(style: unknown): Record<string, unknown> {
  const parts = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...parts.filter(Boolean).map((s) => (Array.isArray(s) ? flatten(s) : s)));
}

/**
 * The sheet's bottom padding — walked up from the drag handle rather than read
 * at a fixed depth, so the assertion survives a wrapper being added or removed.
 */
type StyledNode = { parent: StyledNode | null; props: { style?: unknown } };

function sheetBottomPad(): number | undefined {
  let node = screen.getByLabelText('Close') as unknown as StyledNode | null;
  for (let i = 0; node && i < 8; i += 1) {
    const pad = flatten(node.props?.style).paddingBottom;
    if (typeof pad === 'number') return pad;
    node = node.parent;
  }
  return undefined;
}

beforeEach(() => {
  mockInsets.bottom = 34;
});

describe('Sheet', () => {
  it('carries the bottom safe area as padding, not a native SafeAreaView', async () => {
    // A native SafeAreaView reports 0 inside a nested Modal; the provider does not.
    await render(
      <Sheet visible onClose={jest.fn()}>
        <Text>Body</Text>
      </Sheet>,
    );
    expect(sheetBottomPad()).toBe(spacing.lg + 34);
  });

  it('leaves a fill sheet room below its pinned row, not just the inset', async () => {
    await render(
      <Sheet visible fill onClose={jest.fn()}>
        <View>
          <Text>Save changes</Text>
        </View>
      </Sheet>,
    );
    const pad = sheetBottomPad();
    expect(pad).toBe(spacing.md + 34);
    // The regression: zero margin of its own, flush on the safe-area boundary.
    expect(pad).toBeGreaterThan(34);
  });

  it('still clears the home indicator when the sheet is content-sized', async () => {
    mockInsets.bottom = 0; // Touch-ID iPhone — no indicator, no inset.
    await render(
      <Sheet visible onClose={jest.fn()}>
        <Text>Body</Text>
      </Sheet>,
    );
    expect(sheetBottomPad()).toBe(spacing.lg);
  });

  it('renders nothing when hidden', async () => {
    await render(
      <Sheet visible={false} onClose={jest.fn()}>
        <Text>Body</Text>
      </Sheet>,
    );
    expect(screen.queryByText('Body')).toBeNull();
  });
});
