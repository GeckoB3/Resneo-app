/**
 * Screen — the top-level wrapper every tab/stack screen uses.
 *
 * Pinned here is the bottom safe area. `Screen` reserved only the TOP edge, so
 * every PUSHED route (reports, contact detail, services, add-ons, booking page,
 * team…) ran its last row of content under the home indicator. Tab screens were
 * fine only because the tab bar carries the inset itself, which is exactly why
 * they must NOT reserve it a second time.
 *
 * Reported from an iPhone XS across six screens before it was traced to here.
 */
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Screen } from './Screen';
import { spacing } from '@/theme/index';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockInsets = { top: 47, bottom: 34, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => mockInsets,
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

function flatten(style: unknown): Record<string, unknown> {
  const parts = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...parts.filter(Boolean).map((s) => (Array.isArray(s) ? flatten(s) : s)));
}

type TreeNode = {
  parent: TreeNode | null;
  props: { style?: unknown; contentContainerStyle?: unknown };
};

/** Bottom padding actually in effect, walked up from the rendered content. */
function bottomPad(pick: 'style' | 'contentContainerStyle' = 'style'): number | undefined {
  let node = screen.getByText('Body') as unknown as TreeNode | null;
  for (let i = 0; node && i < 8; i += 1) {
    const target = pick === 'style' ? node.props?.style : node.props?.contentContainerStyle;
    const pad = flatten(target).paddingBottom;
    if (typeof pad === 'number') return pad;
    node = node.parent;
  }
  return undefined;
}

beforeEach(() => {
  mockInsets.bottom = 34;
});

describe('Screen bottom safe area', () => {
  it('clears the home indicator on a pushed screen', async () => {
    await render(
      <Screen padded={false}>
        <Text>Body</Text>
      </Screen>,
    );
    expect(bottomPad()).toBe(34);
  });

  it('adds the inset on top of the padding, rather than replacing it', async () => {
    await render(
      <Screen>
        <Text>Body</Text>
      </Screen>,
    );
    expect(bottomPad()).toBe(spacing.base + 34);
  });

  it('keeps a caller’s own bottom padding and still clears the indicator', async () => {
    // A screen that asked for room at the end of a list must not lose it.
    await render(
      <Screen scroll padded={false} contentContainerStyle={{ paddingBottom: spacing['3xl'] }}>
        <Text>Body</Text>
      </Screen>,
    );
    expect(bottomPad('contentContainerStyle')).toBe(spacing['3xl'] + 34);
  });

  it('reserves nothing on a tab screen, where the tab bar already does', async () => {
    // Double-reserving leaves a dead strip above the tab bar.
    await render(
      <Screen padded={false} bottomInset={false}>
        <Text>Body</Text>
      </Screen>,
    );
    expect(bottomPad()).toBe(0);
  });

  it('costs nothing on a device without an indicator', async () => {
    mockInsets.bottom = 0;
    await render(
      <Screen>
        <Text>Body</Text>
      </Screen>,
    );
    expect(bottomPad()).toBe(spacing.base);
  });
});
