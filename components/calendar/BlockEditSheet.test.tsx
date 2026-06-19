/**
 * BlockEditSheet — block create/edit sends HH:mm times (regression).
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

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

import { BlockEditSheet, type BlockTarget } from '@/components/calendar/BlockEditSheet';

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
}

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({});
  mockUpdate.mockReset().mockResolvedValue({});
  mockDelete.mockReset().mockResolvedValue({});
  mockToast.success.mockReset();
  mockToast.error.mockReset();
});

describe('BlockEditSheet — time wire format', () => {
  it('create sends start/end as HH:mm (no seconds suffix)', async () => {
    const onClose = jest.fn();
    const target: BlockTarget = {
      mode: 'create',
      practitionerId: 'prac_1',
      date: '2026-06-19',
      startTime: '09:00',
    };

    await render(<BlockEditSheet target={target} onClose={onClose} />);
    await press('Block time');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const payload = mockCreate.mock.calls[0][0];
    expect(payload).toMatchObject({
      practitioner_id: 'prac_1',
      block_date: '2026-06-19',
      start_time: '09:00',
      end_time: '09:30', // seeded as start + 30m
    });
    // The seconds suffix is exactly what the create route rejected.
    expect(payload.start_time).not.toContain(':00:00');
    expect(payload.start_time).toMatch(/^\d{2}:\d{2}$/);
    expect(payload.end_time).toMatch(/^\d{2}:\d{2}$/);
    expect(onClose).toHaveBeenCalled();
  });

  it('edit sends start/end as HH:mm (no seconds suffix)', async () => {
    const onClose = jest.fn();
    const target: BlockTarget = {
      mode: 'edit',
      blockId: 'blk_1',
      practitionerId: 'prac_1',
      date: '2026-06-19',
      startTime: '10:00',
      endTime: '11:30',
      reason: 'Lunch',
    };

    await render(<BlockEditSheet target={target} onClose={onClose} />);
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
