import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

import { ContactRow, DetailRow } from '@/components/bookings/detail/DetailRows';

describe('DetailRow', () => {
  it('shows the label and the value', async () => {
    await render(<DetailRow label="Party" value="2 people" />);
    expect(screen.getByText('Party')).toBeTruthy();
    expect(screen.getByText('2 people')).toBeTruthy();
  });
});

describe('ContactRow', () => {
  it('is a button that does what it says', async () => {
    const onPress = jest.fn();
    await render(
      <ContactRow
        icon={{ ios: 'phone', android: 'call', web: 'call' }}
        value="07700 900123"
        accessibilityLabel="Call 07700 900123"
        onPress={onPress}
      />,
    );
    expect(screen.getByText('07700 900123')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Call 07700 900123'));
    expect(onPress).toHaveBeenCalled();
  });
});
