import { render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

import { AppointmentBlock } from '@/components/calendar/AppointmentBlock';

/**
 * The settled marker on a calendar bar. It is a glyph, so the meaning has to
 * reach the accessibility label too: an icon-only signal is invisible to a
 * screen reader and indistinguishable from the compliance dot beside it.
 */
const base = {
  id: 'bk-1',
  guestName: 'Ada Lovelace',
  serviceName: 'Cut & finish',
  timeLabel: '10:00–10:45',
  status: 'Booked',
  height: 120,
  onPress: jest.fn(),
};

describe('AppointmentBlock paid marker', () => {
  it('announces a settled booking in the accessibility label', async () => {
    await render(<AppointmentBlock {...base} paid />);
    expect(screen.getByLabelText(/Ada Lovelace.*paid/)).toBeTruthy();
  });

  it('says nothing when the booking is not settled', async () => {
    await render(<AppointmentBlock {...base} />);
    expect(screen.queryByLabelText(/paid/)).toBeNull();
    // The bar itself still renders.
    expect(screen.getByLabelText(/Ada Lovelace/)).toBeTruthy();
  });
});
