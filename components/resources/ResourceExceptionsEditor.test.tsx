import { act, fireEvent, render, screen } from '@testing-library/react-native';

import {
  ResourceExceptionsEditor,
  resourceExceptionsFromJSON,
  resourceExceptionsToJSON,
  type ResourceExceptionsMap,
} from '@/components/resources/ResourceExceptionsEditor';

// TimePickerField pulls in the native datetimepicker at module load (and renders
// it in "Amended hours" mode). Stub it to a host element so the editor — and its
// amended-hours panel — render under jest without the native dependency.
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

/**
 * Press a calendar/panel control and flush the resulting state update. The day
 * cell is a Pressable whose press handler re-renders on a microtask, so each
 * press must settle before the next reads fresh state (e.g. the range selection).
 */
async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

/** Day cells render their date as the accessibility label (plus a status suffix). */
function dayCell(iso: string) {
  return screen.getByLabelText(new RegExp(`^${iso}(\\.|$)`));
}

/** Current month as "YYYY-MM" — the editor opens on today's month, where days 10–12 always render. */
function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

describe('resourceExceptions JSON round-trip', () => {
  it('keeps closures and preserves multi-range amended days intact', () => {
    const stored: ResourceExceptionsMap = {
      '2026-12-25': { closed: true },
      '2026-12-31': {
        periods: [
          { start: '09:00', end: '12:00' },
          { start: '13:00', end: '17:00' },
        ],
      },
    };
    // from → to is a faithful round-trip: the second split-shift range survives.
    const roundTripped = resourceExceptionsToJSON(resourceExceptionsFromJSON(stored));
    expect(roundTripped).toEqual(stored);
  });

  it('drops empty period lists and ignores nullish input', () => {
    expect(resourceExceptionsFromJSON(undefined)).toEqual({});
    expect(resourceExceptionsFromJSON({ '2026-01-01': { periods: [] } })).toEqual({});
  });
});

describe('ResourceExceptionsEditor', () => {
  it('applies a closure across the tapped inclusive date range', async () => {
    const ym = currentYearMonth();
    const onChange = jest.fn();
    await render(<ResourceExceptionsEditor value={{}} onChange={onChange} />);

    // Tap a start day then an end day → range; "Closed" is the default kind.
    await press(() => dayCell(`${ym}-10`));
    await press(() => dayCell(`${ym}-12`));
    await press(() => screen.getByText('Apply'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({
      [`${ym}-10`]: { closed: true },
      [`${ym}-11`]: { closed: true },
      [`${ym}-12`]: { closed: true },
    });
  });

  it('applies a single-day closure when only one day is selected', async () => {
    const ym = currentYearMonth();
    const onChange = jest.fn();
    await render(<ResourceExceptionsEditor value={{}} onChange={onChange} />);

    await press(() => dayCell(`${ym}-10`));
    await press(() => screen.getByText('Apply'));

    expect(onChange.mock.calls[0][0]).toEqual({ [`${ym}-10`]: { closed: true } });
  });

  it('opens a marked day for editing and removes it', async () => {
    const ym = currentYearMonth();
    const onChange = jest.fn();
    await render(
      <ResourceExceptionsEditor value={{ [`${ym}-10`]: { closed: true } }} onChange={onChange} />,
    );

    // Starts in add mode; tapping the marked day switches to edit mode.
    expect(screen.queryByText('Editing')).toBeNull();
    await press(() => dayCell(`${ym}-10`));
    expect(screen.getByText('Editing')).toBeTruthy();

    await press(() => screen.getByText('Remove'));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('preserves extra split-shift ranges when saving an amended day', async () => {
    const ym = currentYearMonth();
    const onChange = jest.fn();
    const value: ResourceExceptionsMap = {
      [`${ym}-10`]: {
        periods: [
          { start: '09:00', end: '12:00' },
          { start: '13:00', end: '17:00' },
        ],
      },
    };
    await render(<ResourceExceptionsEditor value={value} onChange={onChange} />);

    await press(() => dayCell(`${ym}-10`));
    // The user is warned the extra web-set range is kept.
    expect(screen.getByText(/\+1 more time range/)).toBeTruthy();

    await press(() => screen.getByText('Save changes'));
    expect(onChange).toHaveBeenCalledWith({
      [`${ym}-10`]: {
        periods: [
          { start: '09:00', end: '12:00' },
          { start: '13:00', end: '17:00' },
        ],
      },
    });
  });
});
