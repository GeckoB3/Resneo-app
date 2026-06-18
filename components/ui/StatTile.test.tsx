import { render, screen } from '@testing-library/react-native';

import { MiniSparkline } from '@/components/ui/MiniSparkline';
import { StatTile } from '@/components/ui/StatTile';

/**
 * F4 — StatTile (KPI tile) + MiniSparkline. The sparkline reuses the exact
 * curve-drawing helpers exported from SvgLineChart; here we assert the tile
 * surfaces its label/value/caption/delta and renders without throwing when given
 * (or not given) a trend series.
 */
describe('StatTile', () => {
  it('renders label, value, caption and delta', async () => {
    await render(
      <StatTile
        label="Bookings this week"
        value="32"
        caption="vs 28 last week"
        delta="+14%"
        trend="up"
      />,
    );
    expect(screen.getByText('Bookings this week')).toBeTruthy();
    expect(screen.getByText('32')).toBeTruthy();
    expect(screen.getByText('vs 28 last week')).toBeTruthy();
    expect(screen.getByText('+14%')).toBeTruthy();
  });

  it('renders with a sparkline series without throwing', async () => {
    await render(<StatTile label="Revenue" value="£1,240" sparkline={[3, 5, 4, 8, 7, 10]} trend="up" />);
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('£1,240')).toBeTruthy();
  });

  it('renders fine with no optional props', async () => {
    await render(<StatTile label="No-shows" value="0" />);
    expect(screen.getByText('No-shows')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });
});

describe('MiniSparkline', () => {
  it('renders at an explicit width with a multi-point series', async () => {
    const tree = await render(<MiniSparkline data={[1, 4, 2, 8, 5]} width={120} />);
    // It mounts a host tree (an <Svg> with paths) without throwing.
    expect(tree.toJSON()).toBeTruthy();
  });

  it('renders harmlessly with too few points (no line)', async () => {
    const tree = await render(<MiniSparkline data={[5]} width={120} />);
    expect(tree.toJSON()).toBeTruthy();
  });

  it('handles a flat series (all equal values) without dividing by zero', async () => {
    const tree = await render(<MiniSparkline data={[4, 4, 4, 4]} width={120} />);
    expect(tree.toJSON()).toBeTruthy();
  });
});
