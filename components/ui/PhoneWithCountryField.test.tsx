import { useState } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

// Render Sheet children inline when visible (avoids gesture-handler/Modal).
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

import { PhoneWithCountryField } from '@/components/ui/PhoneWithCountryField';
import type { CountryCode } from '@/lib/phone/e164';

/**
 * The country-code picker on the staff booking form (web parity,
 * `PhoneWithCountryField`). The contract under test is the value it hands the
 * parent: E.164 once the number is valid for the chosen country, the composed
 * "+cc digits" while it is not, '' when empty; and that a picked contact's
 * stored E.164 re-splits into country + national.
 */
function Harness({
  initial = '',
  defaultCountry = 'GB',
  onChange,
}: {
  initial?: string;
  defaultCountry?: CountryCode;
  onChange?: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <PhoneWithCountryField
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      defaultCountry={defaultCountry}
    />
  );
}

const national = () => screen.getByTestId('phone-with-country-national');
const trigger = () => screen.getByTestId('phone-with-country-country');

async function type(text: string) {
  await act(async () => {
    fireEvent.changeText(national(), text);
  });
}

describe('PhoneWithCountryField', () => {
  it('starts on the default country and hands up E.164 once the number is valid', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    expect(screen.getByText('+44')).toBeTruthy();
    await type('7725');
    expect(onChange).toHaveBeenLastCalledWith('+447725');
    await type('7725 123456');
    expect(onChange).toHaveBeenLastCalledWith('+447725123456');
  });

  it('opens the picker, searches, and re-emits for the new country', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    await type('87 123 4567');
    await act(async () => {
      fireEvent.press(trigger());
    });
    expect(screen.getByText('Popular')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search countries'), 'irel');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Ireland +353'));
    });
    expect(screen.getByText('+353')).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith('+353871234567');
  });

  it('says when the number is not valid for the country, on blur', async () => {
    await render(<Harness />);
    await type('12345');
    await act(async () => {
      fireEvent(national(), 'blur');
    });
    expect(screen.getByText('That number is not valid for the selected country.')).toBeTruthy();
  });

  it('splits a stored E.164 into country + national, and follows an external change', async () => {
    function Outer() {
      const [value, setValue] = useState('+353871234567');
      return (
        <>
          <PhoneWithCountryField value={value} onChange={setValue} defaultCountry="GB" />
          <PickButton onPick={() => setValue('+447700900000')} />
        </>
      );
    }
    function PickButton({ onPick }: { onPick: () => void }) {
      return (
        <Pressable onPress={onPick} testID="pick">
          <Text>pick</Text>
        </Pressable>
      );
    }
    await render(<Outer />);
    expect(screen.getByText('+353')).toBeTruthy();
    expect(national().props.value).toBe('871234567');
    await act(async () => {
      fireEvent.press(screen.getByTestId('pick'));
    });
    expect(screen.getByText('+44')).toBeTruthy();
    expect(national().props.value).toBe('7700900000');
  });
});
