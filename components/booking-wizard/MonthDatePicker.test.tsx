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

  it('hides "Start Now" for phone bookings', async () => {
    await render(<MonthDatePicker {...baseProps} source="phone" onStartNow={jest.fn()} />);
    expect(screen.queryByText('Start Now')).toBeNull();
  });

  it('shows "Start Now" for a walk-in and fires onStartNow with today', async () => {
    const onStartNow = jest.fn();
    await render(
      <MonthDatePicker
        {...baseProps}
        source="walk-in"
        timeZone="Europe/London"
        onStartNow={onStartNow}
      />,
    );
    await press(() => screen.getByText('Start Now'));
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

/**
 * R20-3 — a FAILED month lookup must not look like a loading one.
 *
 * `availableDates: null` means "no constraint known", which leaves every date
 * selectable. That is right while loading, and was silently also what an error
 * produced: the grid rendered with nothing marked, which reads as "every date is
 * fine" — a confident answer the app has no basis for. It matters now that web's
 * Stage 7 makes these routes fail closed (503) instead of returning a 200 with
 * dates quietly missing.
 */
describe('MonthDatePicker — failed lookup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('replaces the calendar with a retry instead of an unmarked grid', async () => {
    const onRetry = jest.fn();
    await render(
      <MonthDatePicker {...baseProps} isError errorMessage="Try again shortly." onRetry={onRetry} />,
    );

    expect(screen.getByText("Couldn't check availability")).toBeTruthy();
    expect(screen.getByText('Try again shortly.')).toBeTruthy();
    // The grid is gone — no day cells, and no availability hint implying we know.
    expect(screen.queryByText('Green dates have open times for this service.')).toBeNull();

    await press(() => screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("prefers the server's own copy, and falls back when there is none", async () => {
    await render(<MonthDatePicker {...baseProps} isError onRetry={jest.fn()} />);
    expect(screen.getByText('Could not load which dates are free.')).toBeTruthy();
  });

  it('keeps the walk-in shortcut reachable — it bypasses availability entirely', async () => {
    const onStartNow = jest.fn();
    await render(
      <MonthDatePicker
        {...baseProps}
        isError
        onRetry={jest.fn()}
        source="walk-in"
        onStartNow={onStartNow}
        timeZone="Europe/London"
      />,
    );

    expect(screen.getByText('Start Now')).toBeTruthy();
    await press(() => screen.getByText('Start Now'));
    expect(onStartNow).toHaveBeenCalled();
  });

  it('still renders the grid while merely loading', async () => {
    await render(<MonthDatePicker {...baseProps} isLoading />);
    expect(screen.queryByText("Couldn't check availability")).toBeNull();
    expect(screen.getByText('Continue')).toBeTruthy();
  });
});
