import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Render Sheet children inline (avoids gesture-handler/Modal) when visible.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: () => ({ data: undefined, isFetching: false, isError: false }),
}));
jest.mock('@/lib/queries/useGuestDetail', () => ({
  useGuestDetail: () => ({ data: undefined, isLoading: false, isError: false }),
}));

import { CALENDAR_KEY_ENTRIES } from '@/components/calendar/calendar-key';
import { CalendarToolsSheet } from '@/components/calendar/CalendarToolsSheet';

async function renderSheet(visible = true) {
  const props = {
    visible,
    onClose: jest.fn(),
    clientWord: 'Client',
    timeZone: 'Europe/London',
    onPickBooking: jest.fn(),
    onBook: jest.fn(),
    onViewContact: jest.fn(),
  };
  return { props, view: await render(<CalendarToolsSheet {...props} />) };
}

/**
 * The toolbar's More sheet: the web toolbar's contact search and colour key as
 * steps of one sheet, never a second Modal.
 */
describe('CalendarToolsSheet', () => {
  it('opens on a menu offering the search and the key', async () => {
    await renderSheet();
    expect(screen.getByLabelText('Search contacts')).toBeTruthy();
    expect(screen.getByLabelText('What the colours mean')).toBeTruthy();
  });

  it('shows the colour key with every web entry and a swatch for each', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('What the colours mean'));
    for (const entry of CALENDAR_KEY_ENTRIES) {
      expect(screen.getByText(entry.label)).toBeTruthy();
      expect(screen.getByTestId(`calendar-key-swatch-${entry.blockType}`)).toBeTruthy();
    }
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByLabelText('Search contacts')).toBeTruthy();
  });

  it('shows the contact search under the venue word', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Search contacts'));
    expect(screen.getByText('Search client')).toBeTruthy();
    expect(screen.getByPlaceholderText('Name, phone, or email')).toBeTruthy();
  });

  it('starts on the menu again after it is closed and reopened', async () => {
    const { props, view } = await renderSheet();
    await fireEvent.press(screen.getByLabelText('What the colours mean'));
    await view.rerender(<CalendarToolsSheet {...props} visible={false} />);
    await view.rerender(<CalendarToolsSheet {...props} visible />);
    expect(screen.getByLabelText('Search contacts')).toBeTruthy();
    expect(screen.queryByText(CALENDAR_KEY_ENTRIES[0].label)).toBeNull();
  });
});
