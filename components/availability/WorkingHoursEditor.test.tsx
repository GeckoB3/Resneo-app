/**
 * WorkingHoursEditor — "Save anyway?" 409 acknowledge flow (Availability High).
 *
 * Narrowing a calendar's working hours can orphan upcoming bookings; the route
 * replies 409 `{ requires_confirmation, message }`. The editor must surface an
 * armed ConfirmSheet (web parity with window.confirm) and, on confirm, re-run the
 * PATCH with `{ acknowledge: true }` — keeping the bookings but saving knowingly.
 *
 * The hook-level query-param threading is covered by useAcknowledgeHoursFlow.test;
 * here we pin the UI: 409 → confirm visible → confirm → mutate called with acknowledge.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';

// Native date picker pulled in by TimePickerField — stub to a host element.
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

// Render the Sheet's children inline (avoids react-native-gesture-handler /
// Modal native deps); only show them when `visible` so the confirm is gated.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockMutateAsync = jest.fn();
let mockIsPending = false;
jest.mock('@/lib/queries/useAvailabilityManage', () => ({
  usePatchPractitioner: () => ({ mutateAsync: mockMutateAsync, isPending: mockIsPending }),
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

import { WorkingHoursEditor } from '@/components/availability/WorkingHoursEditor';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

const baseProps = {
  practitionerId: 'prac_1',
  practitionerName: 'Alex',
  // Monday open 09:00–17:00 so the save builds a real working_hours payload.
  currentWorkingHours: { '1': [{ start: '09:00', end: '17:00' }] },
  onClose: jest.fn(),
};

beforeEach(() => {
  mockMutateAsync.mockReset();
  mockIsPending = false;
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  baseProps.onClose.mockReset();
});

describe('WorkingHoursEditor — Save anyway? (409)', () => {
  it('shows the armed confirm on a 409 and re-saves with acknowledge:true', async () => {
    // First save → 409 requires_confirmation; the acknowledged re-save succeeds.
    mockMutateAsync
      .mockRejectedValueOnce(
        new ApiError('conflict', 409, {
          requires_confirmation: true,
          affected_count: 2,
          message: '2 bookings fall outside the new hours.',
        }),
      )
      .mockResolvedValueOnce({ ok: true });

    await render(<WorkingHoursEditor {...baseProps} />);

    // Confirm is hidden until the 409 arrives.
    expect(screen.queryByText('Save these hours anyway?')).toBeNull();

    await press(() => screen.getByText('Save hours'));

    // Armed confirm appears with the server message; nothing saved yet.
    expect(screen.getByText('Save these hours anyway?')).toBeTruthy();
    expect(screen.getByText('2 bookings fall outside the new hours.')).toBeTruthy();
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync.mock.calls[0][0].acknowledge).toBeUndefined();

    // Confirm → second call carries acknowledge:true and the same hours.
    await press(() => screen.getByText('Save anyway'));

    expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    const ackArg = mockMutateAsync.mock.calls[1][0];
    expect(ackArg.acknowledge).toBe(true);
    expect(ackArg.id).toBe('prac_1');
    expect(ackArg.working_hours['1']).toEqual([{ start: '09:00', end: '17:00' }]);
    expect(baseProps.onClose).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('Working hours saved.');
  });

  it('does not show the confirm for a non-409 error (generic toast instead)', async () => {
    mockMutateAsync.mockRejectedValueOnce(new ApiError('nope', 500, { error: 'boom' }));

    await render(<WorkingHoursEditor {...baseProps} />);
    await press(() => screen.getByText('Save hours'));

    expect(screen.queryByText('Save these hours anyway?')).toBeNull();
    expect(mockToast.error).toHaveBeenCalled();
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });
});
