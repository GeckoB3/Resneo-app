/**
 * BlockEditSheet — which calendar, which day, from when to when.
 *
 * The create route (`POST /api/venue/practitioner-calendar-blocks`) validates
 * `start_time`/`end_time` against an exact `HH:mm` regex and rejects a seconds
 * suffix with `{ error: 'Invalid request' }` (400). The sheet previously sent
 * `HH:mm:ss` (`${startTime}:00`), so every "Block time" tap failed. These tests
 * pin the wire format: both create and edit must send bare `HH:mm`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// Render the Sheet's children inline (avoids gesture-handler / Modal native deps).
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

// The OS pickers: a stub the tests can read the value of and fire a change on.
jest.mock('@/components/ui/DatePickerField', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    DatePickerField: (props: { accessibilityLabel: string }) =>
      React.createElement(View, { ...props, testID: props.accessibilityLabel }),
  };
});
jest.mock('@/components/ui/TimePickerField', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    TimePickerField: (props: { accessibilityLabel: string }) =>
      React.createElement(View, { ...props, testID: props.accessibilityLabel }),
  };
});

// Haptics reach expo-haptics native — stub them out (Button uses hapticTap).
jest.mock('@/lib/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  hapticTap: jest.fn(),
  hapticSelect: jest.fn(),
}));

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/lib/queries/useAvailabilityManage', () => ({
  useCreateBlock: () => ({ mutateAsync: mockCreate, isPending: false }),
  useDeleteBlock: () => ({ mutateAsync: mockDelete, isPending: false }),
}));
jest.mock('@/lib/queries/useUpdateBlock', () => ({
  useUpdateBlock: () => ({ mutateAsync: mockUpdate, isPending: false }),
}));

let mockBlockable: { id: string; name: string }[];
jest.mock('@/lib/queries/useBlockableCalendars', () => ({
  useBlockableCalendars: () => mockBlockable,
}));
let mockRoster: { id: string; name: string; is_active?: boolean }[];
jest.mock('@/lib/queries/usePractitioners', () => ({
  usePractitioners: () => ({ data: { practitioners: mockRoster } }),
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: { timezone: 'Europe/London' } }),
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

import { BlockEditSheet, type BlockTarget } from '@/components/calendar/BlockEditSheet';
import { ApiError } from '@/lib/api/client';

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

async function changePicker(label: string, value: string | number) {
  await act(async () => {
    screen.getByTestId(label).props.onChange(value);
  });
}

const ANDREW = { id: 'prac_1', name: 'Andrew' };
const DAVID = { id: 'prac_2', name: 'David' };

const CREATE: BlockTarget = {
  mode: 'create',
  practitionerId: 'prac_1',
  date: '2026-06-19',
  startTime: '09:00',
};
const EDIT: BlockTarget = {
  mode: 'edit',
  blockId: 'blk_1',
  practitionerId: 'prac_1',
  date: '2026-06-19',
  startTime: '10:00',
  endTime: '11:30',
  reason: 'Lunch',
};

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({});
  mockUpdate.mockReset().mockResolvedValue({});
  mockDelete.mockReset().mockResolvedValue({});
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockBlockable = [ANDREW, DAVID];
  mockRoster = [ANDREW, DAVID];
});

describe('BlockEditSheet — time wire format', () => {
  it('create sends start/end as HH:mm (no seconds suffix)', async () => {
    const onClose = jest.fn();

    await render(<BlockEditSheet target={CREATE} onClose={onClose} />);
    await press('Block time');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const payload = mockCreate.mock.calls[0][0];
    expect(payload).toMatchObject({
      practitioner_id: 'prac_1',
      block_date: '2026-06-19',
      start_time: '09:00',
      end_time: '10:00', // seeded as start + 1 hour, as on the web
    });
    // The seconds suffix is exactly what the create route rejected.
    expect(payload.start_time).toMatch(/^\d{2}:\d{2}$/);
    expect(payload.end_time).toMatch(/^\d{2}:\d{2}$/);
    expect(onClose).toHaveBeenCalled();
  });

  it('edit sends start/end as HH:mm (no seconds suffix)', async () => {
    await render(<BlockEditSheet target={EDIT} onClose={jest.fn()} />);
    await press('Save');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const payload = mockUpdate.mock.calls[0][0];
    expect(payload).toMatchObject({
      id: 'blk_1',
      start_time: '10:00',
      end_time: '11:30',
    });
    expect(payload.start_time).toMatch(/^\d{2}:\d{2}$/);
    expect(payload.end_time).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('BlockEditSheet — choosing the calendar, day and times', () => {
  it('saves the calendar, date and times chosen, and says where the block went', async () => {
    await render(<BlockEditSheet target={CREATE} onClose={jest.fn()} />);
    await press('David');
    await changePicker('Block date', '2026-06-24');
    await changePicker('Block start time', 13 * 60);
    await changePicker('Block end time', 14 * 60 + 15);
    await press('Block time');

    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      practitioner_id: 'prac_2',
      block_date: '2026-06-24',
      start_time: '13:00',
      end_time: '14:15',
    });
    expect(mockToast.success).toHaveBeenCalledWith('Time blocked for David on Wed 24 Jun, 13:00 to 14:15');
  });

  it('can move an existing block to another calendar and day', async () => {
    await render(<BlockEditSheet target={EDIT} onClose={jest.fn()} />);
    await press('David');
    await changePicker('Block date', '2026-06-24');
    await press('Save');

    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      id: 'blk_1',
      practitioner_id: 'prac_2',
      block_date: '2026-06-24',
      reason: 'Lunch',
    });
    expect(mockToast.success).toHaveBeenCalledWith('Block updated for David on Wed 24 Jun, 10:00 to 11:30');
  });

  it('starts from the plus button with no slot: the first calendar they may block, today, a default time', async () => {
    jest.useFakeTimers({ now: new Date('2026-06-19T10:10:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      await render(
        <BlockEditSheet target={{ mode: 'create', practitionerId: null, date: null, startTime: null }} onClose={jest.fn()} />,
      );
      await press('Block time');
      // 11:10 in London in June, so the next half hour.
      expect(mockCreate.mock.calls[0][0]).toMatchObject({
        practitioner_id: 'prac_1',
        block_date: '2026-06-19',
        start_time: '11:30',
        end_time: '12:30',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts another day at 09:00', async () => {
    await render(
      <BlockEditSheet target={{ mode: 'create', practitionerId: 'prac_2', date: '2099-01-05', startTime: null }} onClose={jest.fn()} />,
    );
    await press('Block time');
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      practitioner_id: 'prac_2',
      block_date: '2099-01-05',
      start_time: '09:00',
      end_time: '10:00',
    });
  });

  it('falls back to a calendar they may block when the one in view is not theirs', async () => {
    mockBlockable = [DAVID];
    await render(<BlockEditSheet target={CREATE} onClose={jest.fn()} />);
    // One calendar: nothing to choose, but it still says which.
    expect(screen.getByText('David')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'David' })).toBeNull();
    await press('Block time');
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ practitioner_id: 'prac_2' });
  });

  it('keeps an existing block on its own calendar when they could not pick it', async () => {
    mockBlockable = [DAVID];
    mockRoster = [{ id: 'prac_1', name: 'Marcus', is_active: false }, DAVID];
    await render(<BlockEditSheet target={EDIT} onClose={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Marcus (paused)' }).props.accessibilityState).toMatchObject({ selected: true });
    await press('Save');
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ practitioner_id: 'prac_1' });
  });

  it('takes the end along when the start moves past it, and leaves it alone otherwise', async () => {
    await render(<BlockEditSheet target={CREATE} onClose={jest.fn()} />);
    await changePicker('Block start time', 14 * 60);
    expect(screen.getByTestId('Block end time').props.value).toBe(15 * 60);
    await changePicker('Block start time', 14 * 60 + 30);
    expect(screen.getByTestId('Block end time').props.value).toBe(15 * 60);
  });

  it('refuses an end that is not after the start, without saving', async () => {
    await render(<BlockEditSheet target={CREATE} onClose={jest.fn()} />);
    await changePicker('Block end time', 8 * 60);
    await press('Block time');
    expect(screen.getByText('End time must be after start time.')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('shows the server’s reason when a block is refused, and stays open', async () => {
    const onClose = jest.fn();
    mockCreate.mockRejectedValue(new ApiError('Mrs Kelly is booked at this time.', 409));
    await render(<BlockEditSheet target={CREATE} onClose={onClose} />);
    await press('Block time');
    expect(mockToast.error).toHaveBeenCalledWith('Mrs Kelly is booked at this time.');
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
