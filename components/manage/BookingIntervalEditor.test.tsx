/**
 * BookingIntervalEditor — how a service offers start times (web parity:
 * `components/dashboard/appointment-services/BookingIntervalEditor`).
 *
 * Exercises the two modes and the traps between them:
 *  - interval mode: presets, the opt-in per-hour restriction, the mark toggles,
 *  - fixed mode: seeding, adding/removing rows, and the non-blocking warnings,
 *  - switching modes is non-destructive (the other mode's config is remembered),
 *  - the interval survives a switch to fixed times, because the API keeps it so
 *    switching back restores it.
 *
 * jest hoists mock factories above imports, so closed-over variables are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { BookingIntervalEditor, type BookingStartValue } from '@/components/manage/BookingIntervalEditor';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/haptics', () => ({ hapticSelect: jest.fn(), hapticTap: jest.fn() }));

// The native time picker is a host component in tests; expose its value so a row
// change can be simulated without driving the OS dialog.
jest.mock('@/components/ui/TimePickerField', () => ({
  TimePickerField: 'TimePickerField',
}));

const mockOnChange = jest.fn();

beforeEach(() => {
  mockOnChange.mockClear();
});

/** Render with sensible defaults; returns the last value passed to onChange. */
async function renderEditor(overrides: Partial<BookingStartValue & { spanMinutes: number }> = {}) {
  await render(
    <BookingIntervalEditor
      intervalMinutes={overrides.intervalMinutes ?? 15}
      minuteMarks={overrides.minuteMarks ?? null}
      startTimes={overrides.startTimes ?? null}
      spanMinutes={overrides.spanMinutes ?? 30}
      onChange={mockOnChange}
    />,
  );
}

function lastChange(): BookingStartValue {
  return mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1]![0] as BookingStartValue;
}

describe('interval mode', () => {
  it('summarises the unrestricted grid', async () => {
    await renderEditor({ intervalMinutes: 15 });
    expect(screen.getByText('Bookings can start at :00, :15, :30, :45 past each hour.')).toBeTruthy();
  });

  it('changes the interval from a preset chip', async () => {
    await renderEditor({ intervalMinutes: 15 });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Set interval to 30 minutes'));
    });
    expect(lastChange()).toMatchObject({ intervalMinutes: 30, minuteMarks: null, startTimes: null });
  });

  it('starts a restriction from every mark selected, so marks are carved away', async () => {
    await renderEditor({ intervalMinutes: 15 });
    await act(async () => {
      fireEvent(screen.getByRole('switch'), 'valueChange', true);
    });
    expect(lastChange().minuteMarks).toEqual([0, 15, 30, 45]);
  });

  it('toggles an individual mark off', async () => {
    await renderEditor({ intervalMinutes: 15, minuteMarks: [0, 15, 30, 45] });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Toggle start time at 30 minutes past the hour'));
    });
    expect(lastChange().minuteMarks).toEqual([0, 15, 45]);
  });

  it('re-anchors an existing restriction when the interval changes', async () => {
    // :20 does not exist on a 15-minute grid, so it is dropped rather than kept.
    await renderEditor({ intervalMinutes: 20, minuteMarks: [0, 20] });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Set interval to 15 minutes'));
    });
    expect(lastChange()).toMatchObject({ intervalMinutes: 15, minuteMarks: [0] });
  });

  it('warns, without blocking, when a restriction selects nothing', async () => {
    await renderEditor({ intervalMinutes: 15, minuteMarks: [] });
    expect(screen.getByText(/Select at least one start time/)).toBeTruthy();
    expect(
      screen.getByText('No start times selected, so bookings will fall back to every 15-minute mark.'),
    ).toBeTruthy();
  });
});

describe('fixed times mode', () => {
  it('lists the configured times and summarises them on a 12-hour clock', async () => {
    await renderEditor({ startTimes: ['09:20', '13:45'] });
    expect(screen.getByText('Bookings can start at 9:20am, 1:45pm.')).toBeTruthy();
  });

  it('adds a row', async () => {
    await renderEditor({ startTimes: ['09:20'] });
    await act(async () => {
      fireEvent.press(screen.getByText('Add a time'));
    });
    expect(lastChange().startTimes).toEqual(['09:20', '09:00']);
  });

  it('removes a row, and offers no Remove when only one is left', async () => {
    await renderEditor({ startTimes: ['09:20', '13:45'] });
    expect(screen.getAllByText('Remove')).toHaveLength(2);
    await act(async () => {
      fireEvent.press(screen.getAllByText('Remove')[0]!);
    });
    expect(lastChange().startTimes).toEqual(['13:45']);

    mockOnChange.mockClear();
    await renderEditor({ startTimes: ['09:20'] });
    expect(screen.queryByText('Remove')).toBeNull();
  });

  it('warns when two times are closer together than the appointment takes', async () => {
    await renderEditor({ startTimes: ['09:00', '09:20'], spanMinutes: 30 });
    expect(
      screen.getByText(/9:00am and 9:20am are closer together than this service takes \(30 minutes\)/),
    ).toBeTruthy();
  });

  it('does not warn when every gap fits', async () => {
    await renderEditor({ startTimes: ['09:00', '09:30'], spanMinutes: 30 });
    expect(screen.queryByText(/closer together than this service takes/)).toBeNull();
  });

  it('notes that repeated times only count once', async () => {
    await renderEditor({ startTimes: ['09:20', '09:20'] });
    expect(screen.getByText('Repeated times are only counted once.')).toBeTruthy();
  });

  it('warns, without blocking, when no valid time is set', async () => {
    await renderEditor({ startTimes: [] });
    expect(screen.getByText(/Add at least one time/)).toBeTruthy();
    expect(
      screen.getByText('No times set yet, so bookings will fall back to every 15-minute mark.'),
    ).toBeTruthy();
  });
});

describe('switching modes', () => {
  it('seeds a first row when switching to fixed times from scratch', async () => {
    await renderEditor({ startTimes: null });
    await act(async () => {
      fireEvent.press(screen.getByText('Fixed times of day'));
    });
    expect(lastChange().startTimes).toEqual(['09:00']);
  });

  it('keeps the interval and marks when switching to fixed times', async () => {
    // The API stores all three, so switching back must restore the grid exactly.
    await renderEditor({ intervalMinutes: 20, minuteMarks: [0, 20], startTimes: null });
    await act(async () => {
      fireEvent.press(screen.getByText('Fixed times of day'));
    });
    expect(lastChange()).toMatchObject({ intervalMinutes: 20, minuteMarks: [0, 20] });
  });

  it('clears fixed times when switching back to the interval grid', async () => {
    await renderEditor({ startTimes: ['09:20'] });
    await act(async () => {
      fireEvent.press(screen.getByText('Every few minutes'));
    });
    expect(lastChange().startTimes).toBeNull();
  });
});
