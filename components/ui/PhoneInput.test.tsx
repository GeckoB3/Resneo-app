import { useState } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { PhoneInput } from '@/components/ui/PhoneInput';

/**
 * F4 — PhoneInput: a controlled phone field that normalises to an E.164-ish
 * string on blur (via `normalizePhone`) and shows an inline validity error.
 *
 * Fabric focus rule (project memory): normalisation runs on BLUR — the field is
 * losing focus — and pushes the normalised value up via onChangeText; we never
 * setState in onFocus. These tests drive a tiny controlled host so the value
 * round-trips exactly as a real parent screen would wire it.
 */
function Harness({ initial = '', onValid }: { initial?: string; onValid?: (v: boolean) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <PhoneInput value={value} onChangeText={setValue} onValidityChange={onValid} placeholder="phone" />
  );
}

function getField() {
  return screen.getByPlaceholderText('phone');
}

async function blur() {
  await act(async () => {
    fireEvent(getField(), 'blur');
  });
}

describe('PhoneInput', () => {
  it('normalises a GB national number to E.164 on blur', async () => {
    await render(<Harness initial="07725 123456" />);
    expect(getField().props.value).toBe('07725 123456');

    await blur();
    expect(getField().props.value).toBe('+447725123456');
  });

  it('passes live typing straight through, then normalises on blur', async () => {
    await render(<Harness />);
    await act(async () => {
      fireEvent.changeText(getField(), '07700900000');
    });
    expect(getField().props.value).toBe('07700900000');

    await blur();
    expect(getField().props.value).toBe('+447700900000');
  });

  it('shows an inline error for an obviously-too-short number and clears it on edit', async () => {
    await render(<Harness initial="12" />);
    await blur();
    expect(screen.getByText('Enter a valid phone number')).toBeTruthy();

    // Editing again clears the stale validity error.
    await act(async () => {
      fireEvent.changeText(getField(), '07700900000');
    });
    expect(screen.queryByText('Enter a valid phone number')).toBeNull();
  });

  it('treats an empty value as valid (optional field) and reports validity', async () => {
    const onValid = jest.fn();
    await render(<Harness initial="" onValid={onValid} />);
    await blur();
    expect(screen.queryByText('Enter a valid phone number')).toBeNull();
    expect(onValid).toHaveBeenLastCalledWith(true);
  });

  it('reports invalid via onValidityChange for a short number', async () => {
    const onValid = jest.fn();
    await render(<Harness initial="4" onValid={onValid} />);
    await blur();
    expect(onValid).toHaveBeenLastCalledWith(false);
  });
});
