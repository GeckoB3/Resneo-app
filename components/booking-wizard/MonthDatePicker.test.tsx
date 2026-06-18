import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { MonthDatePicker } from '@/components/booking-wizard/MonthDatePicker';

/**
 * Press a control and flush the resulting state update — the day cells and
 * shortcuts are Pressables whose handlers re-render on a microtask, so each
 * press must settle before the next assertion reads fresh state.
 */
async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

// June 2026: `today` (the 18th) is in-month so days 18-30 are selectable.
const baseProps = {
  monthAnchor: '2026-06-01',
  onChangeMonth: jest.fn(),
  today: '2026-06-18',
  selectedDate: '2026-06-18',
  onSelectDate: jest.fn(),
  availableDates: null,
  onContinue: jest.fn(),
};

describe('MonthDatePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('has no Phone / Walk-in source switcher', async () => {
    await render(
      <MonthDatePicker
        {...baseProps}
        weekShortcuts
        source="walk-in"
        timeZone="Europe/London"
        onStartNow={jest.fn()}
      />,
    );
    // The removed Segmented control rendered "Phone" / "Walk-in" option labels.
    expect(screen.queryByText('Phone')).toBeNull();
    expect(screen.queryByText('Walk-in')).toBeNull();
  });

  it('renders +N wk shortcuts without a date sub-label', async () => {
    await render(<MonthDatePicker {...baseProps} weekShortcuts />);
    expect(screen.getByText('+2 wk')).toBeTruthy();
    expect(screen.getByText('+6 wk')).toBeTruthy();
    // The label is exactly "In N weeks" — no trailing ", <date>" — so the button
    // carries no date text.
    expect(screen.getByLabelText('In 2 weeks')).toBeTruthy();
    expect(screen.queryByLabelText(/In 2 weeks,/)).toBeNull();
  });

  it('keeps the Continue action present (reachable below the scrollable calendar)', async () => {
    await render(<MonthDatePicker {...baseProps} weekShortcuts />);
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('hides "Start Appointment Now" for phone bookings', async () => {
    await render(<MonthDatePicker {...baseProps} source="phone" onStartNow={jest.fn()} />);
    expect(screen.queryByText('Start Appointment Now')).toBeNull();
  });

  it('shows "Start Appointment Now" for a walk-in and fires onStartNow with today', async () => {
    const onStartNow = jest.fn();
    await render(
      <MonthDatePicker
        {...baseProps}
        source="walk-in"
        timeZone="Europe/London"
        onStartNow={onStartNow}
      />,
    );
    await press(() => screen.getByText('Start Appointment Now'));
    expect(onStartNow).toHaveBeenCalledTimes(1);
    expect(onStartNow).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('selects a tapped day and jumps months from a week shortcut', async () => {
    await render(<MonthDatePicker {...baseProps} weekShortcuts />);

    await press(() => screen.getByLabelText('2026-06-20'));
    expect(baseProps.onSelectDate).toHaveBeenCalledWith('2026-06-20');

    // +2 weeks from 2026-06-18 = 2026-07-02 → page the calendar and select it.
    await press(() => screen.getByText('+2 wk'));
    expect(baseProps.onChangeMonth).toHaveBeenCalledWith('2026-07-02');
    expect(baseProps.onSelectDate).toHaveBeenCalledWith('2026-07-02');
  });
});
