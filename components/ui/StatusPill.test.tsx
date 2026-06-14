import { render, screen } from '@testing-library/react-native';

import { Badge, StatusPill } from '@/components/ui/Badge';
import { bookingStatusVisualForKey } from '@/lib/booking/booking-status-visual';

/**
 * First component-rendering suite — proves @testing-library/react-native binds a
 * host renderer under React 19.2 / RN 0.85 (jest-expo preset). StatusPill + Badge
 * are pure presentational primitives: their only "context" is `useTheme()`, which
 * reads `useColorScheme()` (a plain RN hook, no provider) — so no wrapper is
 * needed. Pure-logic suites elsewhere are unaffected.
 *
 * NOTE: RNTL 14's `render()` is async (it drives the standalone `test-renderer`
 * `createRoot` via `act`), so every case must `await render(...)` before
 * querying `screen` — calling it synchronously leaves `screen` unpopulated and
 * throws "render function has not been called".
 *
 * StatusPill is the appointments-first booking pill: it remaps the restaurant
 * word "Seated" → "Started" (unless the booking is a real table reservation) and
 * colours itself from the shared web palette (`bookingStatusVisualForKey`).
 */
describe('StatusPill', () => {
  it('renders the status label as text', async () => {
    await render(<StatusPill status="Confirmed" />);
    expect(screen.getByText('Confirmed')).toBeTruthy();
  });

  it('relabels "Seated" as "Started" for appointment venues (web parity)', async () => {
    await render(<StatusPill status="Seated" />);
    expect(screen.getByText('Started')).toBeTruthy();
    expect(screen.queryByText('Seated')).toBeNull();
  });

  it('keeps "Seated" wording for genuine table reservations', async () => {
    await render(<StatusPill status="Seated" isTableReservation />);
    expect(screen.getByText('Seated')).toBeTruthy();
    expect(screen.queryByText('Started')).toBeNull();
  });

  it('paints the pill from the shared web palette for the status', async () => {
    await render(<StatusPill status="Pending" />);
    const visual = bookingStatusVisualForKey('Pending');
    // The label inherits the palette's text colour; the container is tinted with
    // the palette background + border. Asserting on the label's resolved colour
    // proves the visual lookup is wired through to the rendered node.
    const label = screen.getByText('Pending');
    const flattened = Array.isArray(label.props.style)
      ? Object.assign({}, ...label.props.style.flat())
      : label.props.style;
    expect(flattened.color).toBe(visual.textColor);
  });
});

describe('Badge', () => {
  it('renders its label', async () => {
    await render(<Badge label="VIP" tone="brand" />);
    expect(screen.getByText('VIP')).toBeTruthy();
  });

  it('renders a solid-tone badge label too', async () => {
    await render(<Badge label="Deposit" tone="success" solid />);
    expect(screen.getByText('Deposit')).toBeTruthy();
  });
});
