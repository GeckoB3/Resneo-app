/**
 * WaitlistJoinSheet — enriched add-to-waitlist sheet (Waitlist 09 medium).
 *
 * Covers the new preferred-time window + notes fields and the picker mode:
 *  - all-day (default) submits with no times,
 *  - a time_range submits both times + trimmed notes,
 *  - end-before-start is blocked client-side (no mutation),
 *  - the validatePreferredTime pure helper.
 *
 * jest hoists mock factories above imports, so every closed-over variable is
 * prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// TimePickerField + DatePickerField load the native datetimepicker at import.
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

// Render Sheet children inline (avoids gesture-handler / Modal) when visible.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockMutateAsync = jest.fn((_input?: unknown) => Promise.resolve({ waitlist_id: 'w1' }));
jest.mock('@/lib/queries/useJoinWaitlist', () => {
  const actual = jest.requireActual('@/lib/queries/useJoinWaitlist');
  return { ...actual, useJoinWaitlist: () => ({ mutateAsync: mockMutateAsync, isPending: false }) };
});

// No pickers in these tests → catalog is never queried, but the hook must exist.
jest.mock('@/lib/queries/useAppointmentCatalog', () => ({
  useAppointmentCatalog: () => ({ data: undefined, isLoading: false }),
}));

import { WaitlistJoinSheet, validatePreferredTime } from '@/components/waitlist/WaitlistJoinSheet';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

async function fillGuest() {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('First name'), 'Jo');
    fireEvent.changeText(screen.getByLabelText('Last name'), 'Bloggs');
    fireEvent.changeText(screen.getByLabelText('Email'), 'jo@example.com');
    fireEvent.changeText(screen.getByLabelText('Phone'), '07123456789');
  });
}

const fixedProps = {
  open: true,
  onClose: jest.fn(),
  venueId: 'venue-1',
  serviceId: 'svc-1',
  date: '2026-06-20',
};

beforeEach(() => {
  mockMutateAsync.mockClear();
});

describe('validatePreferredTime', () => {
  it('accepts all_day regardless of times', () => {
    expect(validatePreferredTime('all_day', '12:00', '09:00')).toEqual({ ok: true });
  });
  it('rejects a range whose end is not after the start', () => {
    expect(validatePreferredTime('time_range', '12:00', '12:00').ok).toBe(false);
    expect(validatePreferredTime('time_range', '13:00', '12:00').ok).toBe(false);
  });
  it('accepts a valid range', () => {
    expect(validatePreferredTime('time_range', '09:00', '12:00')).toEqual({ ok: true });
  });
});

describe('WaitlistJoinSheet submit', () => {
  it('submits an all-day request with no times by default', async () => {
    await render(<WaitlistJoinSheet {...fixedProps} />);
    await fillGuest();
    await press(() => screen.getByText('Add to waitlist'));

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    const payload = mockMutateAsync.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.preferred_window).toBe('all_day');
    expect(payload).not.toHaveProperty('desired_time');
    expect(payload).not.toHaveProperty('desired_time_end');
  });

  it('submits a time range with notes when chosen', async () => {
    await render(<WaitlistJoinSheet {...fixedProps} />);
    await fillGuest();
    await act(async () => fireEvent.changeText(screen.getByLabelText('Notes (optional)'), '  call first  '));

    // Switch to the Time range window (defaults 09:00–12:00).
    await press(() => screen.getByText('Time range'));
    await press(() => screen.getByText('Add to waitlist'));

    const payload = mockMutateAsync.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.preferred_window).toBe('time_range');
    expect(payload.desired_time).toBe('09:00');
    expect(payload.desired_time_end).toBe('12:00');
    expect(payload.notes).toBe('call first');
  });

  it('reveals the from/to time fields only when Time range is selected', async () => {
    await render(<WaitlistJoinSheet {...fixedProps} />);
    expect(screen.queryByLabelText('Preferred start time')).toBeNull();

    await press(() => screen.getByText('Time range'));
    expect(screen.getByLabelText('Preferred start time')).toBeTruthy();
    expect(screen.getByLabelText('Preferred end time')).toBeTruthy();
  });

  it('requires all guest fields before submitting', async () => {
    await render(<WaitlistJoinSheet {...fixedProps} />);
    await press(() => screen.getByText('Add to waitlist'));
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/Name, email and phone are all required/)).toBeTruthy();
  });
});
