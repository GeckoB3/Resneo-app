/**
 * BreaksEditor — R19-5: apply the same breaks to every calendar at once.
 *
 * A lunch break is nearly always the same shape across a team, and retyping it
 * per calendar is how two calendars end up disagreeing by a typo nobody
 * notices. `/api/venue/practitioners` takes a single id, so this is one PATCH
 * per calendar — which is why a partial failure has to report what actually
 * saved, not what was attempted. Since the second pass on the Availability
 * screen the fan-out is the web's "Save to all calendars" button, which asks
 * first because it overwrites the others' breaks.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';

import { BreaksEditor } from '@/components/availability/BreaksEditor';

const mockMutateAsync = jest.fn();
jest.mock('@/lib/queries/useAvailabilityManage', () => ({
  usePatchPractitioner: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

/** The OS time picker stands in as a label showing the value it holds. */
jest.mock('@/components/ui/TimePickerField', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    TimePickerField: ({ value, accessibilityLabel }: { value: number; accessibilityLabel: string }) =>
      React.createElement(Text, { accessibilityLabel }, `T${value}`),
  };
});

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

const SAVE_ALL = 'Save to all calendars';
const CONFIRM_ALL = 'Replace breaks';

const baseProps = {
  practitionerId: 'cal_1',
  practitionerName: 'Alex',
  currentBreaksByDay: { '1': [{ start: '12:00', end: '13:00' }] },
  onClose: jest.fn(),
};

const threeCalendars = [
  { id: 'cal_1', name: 'Alex' },
  { id: 'cal_2', name: 'Sam' },
  { id: 'cal_3', name: 'Jo' },
];

beforeEach(() => {
  mockMutateAsync.mockReset().mockResolvedValue({ ok: true });
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  baseProps.onClose.mockReset();
});

describe('BreaksEditor — apply to all calendars', () => {
  it('saves only the selected calendar by default', async () => {
    await render(<BreaksEditor {...baseProps} applyToAllCalendars={threeCalendars} />);

    await press(() => screen.getByText('Save breaks'));

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync.mock.calls[0]![0].id).toBe('cal_1');
    expect(mockToast.success).toHaveBeenCalledWith('Breaks saved.');
  });

  it('asks before writing every calendar, then saves them all', async () => {
    await render(<BreaksEditor {...baseProps} applyToAllCalendars={threeCalendars} />);

    await press(() => screen.getByText(SAVE_ALL));
    // The web's window.confirm, as a step of the editor: nothing saved yet.
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Replace the breaks on 2 other calendars with these? Their existing breaks will be overwritten.',
      ),
    ).toBeTruthy();

    await press(() => screen.getByText(CONFIRM_ALL));

    expect(mockMutateAsync).toHaveBeenCalledTimes(3);
    expect(mockMutateAsync.mock.calls.map((c) => c[0].id)).toEqual(['cal_1', 'cal_2', 'cal_3']);
    // Same payload everywhere, and the legacy every-day field cleared each time.
    for (const call of mockMutateAsync.mock.calls) {
      expect(call[0].break_times).toEqual([]);
      expect(call[0].break_times_by_day['1']).toEqual([{ start: '12:00', end: '13:00' }]);
    }
    expect(mockToast.success).toHaveBeenCalledWith('Breaks saved to 3 calendars.');
  });

  it('declining the confirm saves nothing', async () => {
    await render(<BreaksEditor {...baseProps} applyToAllCalendars={threeCalendars} />);

    await press(() => screen.getByText(SAVE_ALL));
    await press(() => screen.getByText('Cancel'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(SAVE_ALL)).toBeTruthy();
  });

  it('reports what actually saved when a later calendar fails', async () => {
    mockMutateAsync
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new ApiError('nope', 500, { error: 'boom' }));

    await render(<BreaksEditor {...baseProps} applyToAllCalendars={threeCalendars} />);

    await press(() => screen.getByText(SAVE_ALL));
    await press(() => screen.getByText(CONFIRM_ALL));

    // Stopped at the failure — the third was never attempted.
    expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    expect(mockToast.error).toHaveBeenCalledWith(
      'Saved breaks to 1 of 3 calendars, then failed. Check the remaining ones.',
    );
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  it('surfaces the plain error when nothing saved at all', async () => {
    mockMutateAsync.mockRejectedValueOnce(new ApiError('Forbidden', 403, { error: 'Forbidden' }));

    await render(<BreaksEditor {...baseProps} applyToAllCalendars={threeCalendars} />);
    await press(() => screen.getByText('Save breaks'));

    expect(mockToast.error).toHaveBeenCalledWith('Forbidden');
  });

  it('hides the fan-out when this is the only calendar', async () => {
    await render(
      <BreaksEditor {...baseProps} applyToAllCalendars={[{ id: 'cal_1', name: 'Alex' }]} />,
    );
    expect(screen.queryByText(SAVE_ALL)).toBeNull();
  });

  it('hides the fan-out when the caller passes no list at all', async () => {
    await render(<BreaksEditor {...baseProps} />);
    expect(screen.queryByText(SAVE_ALL)).toBeNull();
  });

  it('hides the fan-out when the calendar on screen is not one this user may write to', async () => {
    // A staff member opening a colleague's breaks: the permitted list is their
    // own calendars, so fanning out from here would just be a run of 403s.
    await render(
      <BreaksEditor
        {...baseProps}
        practitionerId="cal_9"
        practitionerName="Someone else"
        applyToAllCalendars={[
          { id: 'cal_1', name: 'Alex' },
          { id: 'cal_2', name: 'Sam' },
        ]}
      />,
    );
    expect(screen.queryByText(SAVE_ALL)).toBeNull();
  });

  it('refuses to save a break that ends before it starts, on any calendar', async () => {
    await render(
      <BreaksEditor
        {...baseProps}
        currentBreaksByDay={{ '1': [{ start: '13:00', end: '12:00' }] }}
        applyToAllCalendars={threeCalendars}
      />,
    );

    await press(() => screen.getByText(SAVE_ALL));

    // Refused before the question is even asked.
    expect(screen.queryByText(CONFIRM_ALL)).toBeNull();
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(
      'Break end time must be after start for Monday.',
    );
  });

  it('read-only: no controls, just the hint (a colleague looking at this calendar)', async () => {
    await render(
      <BreaksEditor
        {...baseProps}
        readOnly
        readOnlyHint="View only - you can edit breaks for calendars linked to your account only."
        applyToAllCalendars={threeCalendars}
      />,
    );
    expect(screen.queryByText('Save breaks')).toBeNull();
    expect(screen.queryByText('+ Add break')).toBeNull();
    expect(
      screen.getByText('View only - you can edit breaks for calendars linked to your account only.'),
    ).toBeTruthy();
    // The breaks themselves still read.
    expect(screen.getByLabelText('Monday break 1 start')).toBeTruthy();
  });
});
