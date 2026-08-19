/**
 * OpeningHoursEditor — R19-1: a day is no longer capped at two periods.
 *
 * The cap was never a product rule. It existed because this editor offered
 * "Add second period" only while a day had exactly one, and the backend's
 * `openingHoursDaySchema.max(2)` was what stopped that display limit becoming
 * data loss on save. Web removed the schema cap; this pins the editor half.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// Native date picker pulled in by TimePickerField — stub to a host element.
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

import { OpeningHoursEditor } from '@/components/manage/OpeningHoursEditor';
import type { OpeningHours } from '@/types/venue';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

/**
 * Render with a controlled value, returning the mock the editor emits through.
 * RNTL 14's `render()` is async, so this awaits it (`screen` is only wired once
 * it resolves).
 */
async function renderEditor(initial: OpeningHours, editable = true) {
  const onChange = jest.fn();
  await render(<OpeningHoursEditor value={initial} onChange={onChange} editable={editable} />);
  return onChange;
}

describe('OpeningHoursEditor — periods per day', () => {
  it('adds a period an hour after the last one closes', async () => {
    const onChange = await renderEditor({ '1': { periods: [{ open: '09:00', close: '17:00' }] } });

    await press(() => screen.getByText('+ Add period'));

    expect(onChange).toHaveBeenCalledWith({
      '1': {
        periods: [
          { open: '09:00', close: '17:00' },
          // NOT the old hardcoded `{ open: previous.close, close: '21:00' }`.
          { open: '18:00', close: '19:00' },
        ],
      },
    });
  });

  it('still offers Add on a day that already has two periods', async () => {
    const onChange = await renderEditor({
      '1': {
        periods: [
          { open: '09:00', close: '12:00' },
          { open: '13:00', close: '17:00' },
        ],
      },
    });

    await press(() => screen.getByText('+ Add period'));

    expect(onChange).toHaveBeenCalledWith({
      '1': {
        periods: [
          { open: '09:00', close: '12:00' },
          { open: '13:00', close: '17:00' },
          { open: '18:00', close: '19:00' },
        ],
      },
    });
  });

  it('renders every period of a three-period day, each removable', async () => {
    await renderEditor({
      '1': {
        periods: [
          { open: '08:00', close: '11:00' },
          { open: '12:00', close: '15:00' },
          { open: '18:00', close: '21:00' },
        ],
      },
    });

    expect(screen.getAllByLabelText('Monday opening time')).toHaveLength(3);
    expect(screen.getAllByLabelText('Remove Monday period')).toHaveLength(3);
  });

  it('never offers to remove the only period — closing a day is the toggle’s job', async () => {
    await renderEditor({ '1': { periods: [{ open: '09:00', close: '17:00' }] } });
    expect(screen.queryByLabelText('Remove Monday period')).toBeNull();
  });

  it('explains instead of offering Add when the day runs to the end', async () => {
    await renderEditor({ '1': { periods: [{ open: '20:00', close: '23:30' }] } });

    expect(
      screen.getByText(
        'The last period runs to the end of the day, so there is no room for another one.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('+ Add period')).toBeNull();
  });

  it('shows no Add control at all in the read-only (non-admin) render', async () => {
    await renderEditor({ '1': { periods: [{ open: '09:00', close: '17:00' }] } }, false);
    expect(screen.queryByText('+ Add period')).toBeNull();
    expect(screen.getByText('09:00–17:00')).toBeTruthy();
  });
});
