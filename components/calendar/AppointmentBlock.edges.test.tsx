/**
 * The bar's edges (the web's `bookingCalendarBlockCardStyle`, ported): a
 * pale ring outside a 1px border in the status's deeper hue, so touching bars
 * of one status stay two bars, and a glossy top edge for dimension. The
 * layout is sized to the area inside that chrome.
 */
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

import { AppointmentBlock } from '@/components/calendar/AppointmentBlock';

const base = {
  id: 'bk-1',
  guestName: 'Ada Lovelace',
  serviceName: 'Cut & finish',
  timeLabel: '10:00–10:45',
  status: 'Confirmed',
  height: 120,
  onPress: jest.fn(),
};

function flatStyle(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));
}

describe('AppointmentBlock edges', () => {
  it('draws a pale ring outside a 1px status border', async () => {
    await render(<AppointmentBlock {...base} />);
    const ring = flatStyle(screen.getByTestId('bar-ring').props.style);
    expect(ring.borderWidth).toBe(1);
    expect(typeof ring.borderColor).toBe('string');
    const bar = flatStyle(screen.getByLabelText(/Ada Lovelace/).props.style);
    expect(bar.borderWidth).toBe(1);
    // Confirmed: navy fill with its deeper border hue.
    expect(bar.backgroundColor).toBe('#003B6F');
    expect(bar.borderColor).toBe('#00284B');
  });

  it('adds a glossy top edge', async () => {
    await render(<AppointmentBlock {...base} />);
    const gloss = flatStyle(screen.getByTestId('bar-gloss').props.style);
    expect(gloss.height).toBe(1);
    expect(gloss.top).toBe(0);
  });

  it('still lays out the name and service on a tall bar', async () => {
    await render(<AppointmentBlock {...base} />);
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Cut & finish')).toBeTruthy();
  });
});
