/**
 * BreaksEditor — R19-5: apply the same breaks to every calendar at once.
 *
 * A lunch break is nearly always the same shape across a team, and retyping it
 * per calendar is how two calendars end up disagreeing by a typo nobody
 * notices. `/api/venue/practitioners` takes a single id, so this is one PATCH
 * per calendar — which is why a partial failure has to report what actually
 * saved, not what was attempted.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';

const mockMutateAsync = jest.fn();
jest.mock('@/lib/queries/useAvailabilityManage', () => ({
  usePatchPractitioner: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

import { BreaksEditor } from '@/components/availability/BreaksEditor';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

const SWITCH_LABEL = 'Apply these breaks to all calendars';

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

  it('saves every calendar once the switch is on', async () => {
    await render(<BreaksEditor {...baseProps} applyToAllCalendars={threeCalendars} />);

    await act(async () => {
      fireEvent(screen.getByLabelText(SWITCH_LABEL), 'valueChange', true);
    });
    await press(() => screen.getByText('Save breaks'));

    expect(mockMutateAsync).toHaveBeenCalledTimes(3);
    expect(mockMutateAsync.mock.calls.map((c) => c[0].id)).toEqual(['cal_1', 'cal_2', 'cal_3']);
    // Same payload everywhere, and the legacy every-day field cleared each time.
    for (const call of mockMutateAsync.mock.calls) {
      expect(call[0].break_times).toEqual([]);
      expect(call[0].break_times_by_day['1']).toEqual([{ start: '12:00', end: '13:00' }]);
    }
    expect(mockToast.success).toHaveBeenCalledWith('Breaks saved to 3 calendars.');
  });

  it('reports what actually saved when a later calendar fails', async () => {
    mockMutateAsync
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new ApiError('nope', 500, { error: 'boom' }));

    await render(<BreaksEditor {...baseProps} applyToAllCalendars={threeCalendars} />);

    await act(async () => {
      fireEvent(screen.getByLabelText(SWITCH_LABEL), 'valueChange', true);
    });
    await press(() => screen.getByText('Save breaks'));

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

  it('hides the switch when this is the only calendar', async () => {
    await render(
      <BreaksEditor {...baseProps} applyToAllCalendars={[{ id: 'cal_1', name: 'Alex' }]} />,
    );
    expect(screen.queryByLabelText(SWITCH_LABEL)).toBeNull();
  });

  it('hides the switch when the caller passes no list at all', async () => {
    await render(<BreaksEditor {...baseProps} />);
    expect(screen.queryByLabelText(SWITCH_LABEL)).toBeNull();
  });

  it('hides the switch when the calendar on screen is not one this user may write to', async () => {
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
    expect(screen.queryByLabelText(SWITCH_LABEL)).toBeNull();
  });

  it('refuses to save a break that ends before it starts, on any calendar', async () => {
    await render(
      <BreaksEditor
        {...baseProps}
        currentBreaksByDay={{ '1': [{ start: '13:00', end: '12:00' }] }}
        applyToAllCalendars={threeCalendars}
      />,
    );

    await act(async () => {
      fireEvent(screen.getByLabelText(SWITCH_LABEL), 'valueChange', true);
    });
    await press(() => screen.getByText('Save breaks'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(
      'Break end time must be after start for Monday.',
    );
  });
});
