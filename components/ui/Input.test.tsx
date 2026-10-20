import { createRef } from 'react';
import type { TextInput } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { Input } from '@/components/ui/Input';

/** Renders the field and stubs the native setSelection the jest TextInput mock lacks. */
async function renderField(props: Parameters<typeof Input>[0]) {
  const ref = createRef<TextInput>();
  await render(<Input ref={ref} label="Amount" onChangeText={() => undefined} {...props} />);
  const setSelection = jest.fn();
  Object.assign(ref.current!, { setSelection });
  return { ref, setSelection, field: screen.getByLabelText('Amount') };
}

async function focus(field: ReturnType<typeof screen.getByLabelText>) {
  await act(async () => {
    fireEvent(field, 'focus');
  });
}

describe('Input select-on-focus', () => {
  it('selects a pre-filled number on focus, so typing replaces it', async () => {
    const { setSelection, field } = await renderField({ value: '35.00', keyboardType: 'decimal-pad' });
    await focus(field);
    expect(setSelection).toHaveBeenCalledWith(0, 5);
  });

  it('never hands the native prop to iOS or Android (Android re-selects after the first keystroke)', async () => {
    const { field } = await renderField({ value: '35.00', keyboardType: 'decimal-pad' });
    expect(field.props.selectTextOnFocus).toBe(false);
  });

  it('selects nothing in an empty number field', async () => {
    const { setSelection, field } = await renderField({ value: '', inputMode: 'decimal' });
    await focus(field);
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('leaves text fields alone', async () => {
    const { setSelection, field } = await renderField({ value: 'Jane' });
    await focus(field);
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('lets a number field opt out', async () => {
    const { setSelection, field } = await renderField({ value: '12', keyboardType: 'number-pad', selectTextOnFocus: false });
    await focus(field);
    expect(setSelection).not.toHaveBeenCalled();
  });

  it("still calls the screen's onFocus and fills the forwarded ref", async () => {
    const onFocus = jest.fn();
    const { ref, field } = await renderField({ value: '4', keyboardType: 'number-pad', onFocus });
    await focus(field);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(ref.current).not.toBeNull();
  });
});
