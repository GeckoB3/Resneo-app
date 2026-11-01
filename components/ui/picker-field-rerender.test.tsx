/**
 * Android's picker reopens its dialog when its callbacks change, resetting what the person has
 * picked. A re-render behind an open dialog (the diary's clock tick, live sync) must not change them.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

type PickerProps = { value: Date; onValueChange: (e: unknown, d: Date) => void; onDismiss: () => void };
const mockPickers: PickerProps[] = [];
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: (props: PickerProps) => {
    mockPickers.push(props);
    return null;
  },
}));

import { DatePickerField } from '@/components/ui/DatePickerField';
import { TimePickerField } from '@/components/ui/TimePickerField';

const originalOS = Platform.OS;
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
});
afterAll(() => {
  Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
});
beforeEach(() => {
  mockPickers.length = 0;
});

const lastPicker = () => mockPickers[mockPickers.length - 1]!;

describe('the time field', () => {
  it('keeps the same callbacks through a re-render, and calls the latest onChange', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = await render(<TimePickerField value={540} onChange={first} accessibilityLabel="Start" />);
    await act(async () => fireEvent.press(screen.getByLabelText('Start')));
    const opened = lastPicker();

    await rerender(<TimePickerField value={540} onChange={second} accessibilityLabel="Start" />);
    expect(lastPicker().onValueChange).toBe(opened.onValueChange);
    expect(lastPicker().onDismiss).toBe(opened.onDismiss);
    expect(lastPicker().value.getTime()).toBe(opened.value.getTime());

    await act(async () => lastPicker().onValueChange({}, new Date(2000, 0, 1, 14, 30)));
    expect(second).toHaveBeenCalledWith(14 * 60 + 30);
    expect(first).not.toHaveBeenCalled();
  });
});

describe('the date field', () => {
  it('keeps the same callbacks through a re-render, and calls the latest onChange', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = await render(<DatePickerField value="2026-11-04" onChange={first} accessibilityLabel="Date" />);
    await act(async () => fireEvent.press(screen.getByLabelText('Date')));
    const opened = lastPicker();

    await rerender(<DatePickerField value="2026-11-04" onChange={second} accessibilityLabel="Date" />);
    expect(lastPicker().onValueChange).toBe(opened.onValueChange);
    expect(lastPicker().onDismiss).toBe(opened.onDismiss);

    await act(async () => lastPicker().onValueChange({}, new Date(2026, 10, 6, 12)));
    expect(second).toHaveBeenCalledWith('2026-11-06');
    expect(first).not.toHaveBeenCalled();
  });
});
