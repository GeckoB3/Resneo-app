import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { PasswordInput } from '@/components/ui/PasswordInput';

describe('PasswordInput', () => {
  it('starts masked and reveals the password on the eye, then hides it again', async () => {
    await render(<PasswordInput label="New password" value="hunter22" onChangeText={() => undefined} placeholder="pw" />);
    const field = screen.getByPlaceholderText('pw');
    expect(field.props.secureTextEntry).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Show password'));
    });
    expect(screen.getByPlaceholderText('pw').props.secureTextEntry).toBe(false);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Hide password'));
    });
    expect(screen.getByPlaceholderText('pw').props.secureTextEntry).toBe(true);
  });
});
