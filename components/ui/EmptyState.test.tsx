import { Text as RNText } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { EmptyState } from '@/components/ui/EmptyState';

/**
 * EmptyState exercises a deeper slice than StatusPill: it renders title +
 * message text, an optional action `Button` (which imports
 * react-native-reanimated — covered by the jest.setup mock), and switches
 * between a small `icon` node and a branded SVG `illustration` (react-native-svg
 * under jest-expo). Asserting all three proves the component renderer handles
 * the reanimated + svg dependency chain, not just plain Views/Text.
 */
describe('EmptyState', () => {
  it('renders the title and message', async () => {
    await render(<EmptyState title="No bookings yet" message="Your day is clear." />);
    expect(screen.getByText('No bookings yet')).toBeTruthy();
    expect(screen.getByText('Your day is clear.')).toBeTruthy();
  });

  it('renders the action button and fires onAction when pressed', async () => {
    const onAction = jest.fn();
    await render(
      <EmptyState
        title="No clients"
        message="Add your first client to get started."
        actionLabel="Add client"
        onAction={onAction}
      />,
    );
    const button = screen.getByText('Add client');
    expect(button).toBeTruthy();
    fireEvent.press(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('omits the action button when no actionLabel/onAction is given', async () => {
    await render(<EmptyState title="Empty" message="Nothing here." />);
    expect(screen.queryByText('Add client')).toBeNull();
  });

  it('renders a custom icon node above the title', async () => {
    await render(
      <EmptyState
        title="Search"
        message="No matches."
        icon={<RNText>ICON_GLYPH</RNText>}
      />,
    );
    expect(screen.getByText('ICON_GLYPH')).toBeTruthy();
    expect(screen.getByText('Search')).toBeTruthy();
  });

  it('renders a branded illustration variant (and still shows the title)', async () => {
    // The `"bookings"` variant resolves to the EmptyBookings SVG scene. We do not
    // assert on SVG internals (no stable text) — rendering it without throwing,
    // alongside the title, proves the react-native-svg path renders.
    await render(
      <EmptyState title="No bookings" message="Tap + to add one." illustration="bookings" />,
    );
    expect(screen.getByText('No bookings')).toBeTruthy();
    expect(screen.getByText('Tap + to add one.')).toBeTruthy();
  });

  it('prefers the illustration over the icon when both are supplied', async () => {
    // `illustration` takes precedence over `icon` (see EmptyState docs), so the
    // small icon node should NOT be rendered when a variant is also passed.
    await render(
      <EmptyState
        title="Inbox"
        message="All caught up."
        icon={<RNText>SMALL_ICON</RNText>}
        illustration="inbox"
      />,
    );
    expect(screen.queryByText('SMALL_ICON')).toBeNull();
    expect(screen.getByText('Inbox')).toBeTruthy();
  });
});
