/**
 * Settings-14 (Critical): DeleteVenueSheet — the self-serve venue-deletion
 * danger zone. Exercises the three states and the armed type-to-confirm:
 *  - request form: the "Schedule venue deletion" button is DISABLED until the
 *    typed name matches the venue name (case-insensitive), then POSTs.
 *  - scheduled state: shows the date + a Cancel path that POSTs the cancel route.
 *
 * No `Alert.alert` is used — the destructive action is armed by typing the name.
 *
 * jest hoists mock factories above imports, so every variable a factory closes
 * over is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// Render Sheet children inline (avoids gesture-handler/Modal) when visible.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

// NOTE: haptics are NOT mocked — the global jest.setup mocks expo-haptics, so the
// real lib/haptics (incl. hapticTap fired by Button on press) resolves cleanly.
// Mocking lib/haptics here without hapticTap makes every Button press throw.

// --- Deletion hook mocks (mock-prefixed for jest hoisting) ------------------
const mockRequestMutateAsync = jest.fn(() => Promise.resolve({ deletion_scheduled_at: null, note: null }));
const mockCancelMutateAsync = jest.fn(() => Promise.resolve({ ok: true }));
let mockStatusData: { venue_name: string; deletion_scheduled_at: string | null } | undefined = {
  venue_name: 'Glow Bar',
  deletion_scheduled_at: null,
};
let mockStatusState = { isSuccess: true, isError: false };

jest.mock('@/lib/queries/useVenueDeletion', () => ({
  useVenueDeletionStatus: () => ({
    data: mockStatusData,
    isSuccess: mockStatusState.isSuccess,
    isError: mockStatusState.isError,
  }),
  useRequestVenueDeletion: () => ({ mutateAsync: mockRequestMutateAsync, isPending: false }),
  useCancelVenueDeletion: () => ({ mutateAsync: mockCancelMutateAsync, isPending: false }),
}));

import { DeleteVenueSheet } from '@/components/manage/DeleteVenueSheet';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => {
  mockRequestMutateAsync.mockClear();
  mockCancelMutateAsync.mockClear();
  mockStatusData = { venue_name: 'Glow Bar', deletion_scheduled_at: null };
  mockStatusState = { isSuccess: true, isError: false };
});

describe('DeleteVenueSheet — request form (type-to-confirm)', () => {
  it('keeps the schedule button disabled until the typed name matches', async () => {
    await render(<DeleteVenueSheet visible venueName="Glow Bar" onClose={jest.fn()} />);

    const scheduleBtn = screen.getByText('Schedule venue deletion');

    // Disabled before typing.
    await press(() => scheduleBtn);
    expect(mockRequestMutateAsync).not.toHaveBeenCalled();

    // A wrong value stays disabled.
    const field = screen.getByPlaceholderText('Glow Bar');
    await act(async () => {
      fireEvent.changeText(field, 'Wrong Name');
    });
    await press(() => scheduleBtn);
    expect(mockRequestMutateAsync).not.toHaveBeenCalled();
  });

  it('enables + POSTs once the name matches (case-insensitive)', async () => {
    await render(<DeleteVenueSheet visible venueName="Glow Bar" onClose={jest.fn()} />);

    const field = screen.getByPlaceholderText('Glow Bar');
    await act(async () => {
      fireEvent.changeText(field, '  glow bar  ');
    });
    await press(() => screen.getByText('Schedule venue deletion'));

    expect(mockRequestMutateAsync).toHaveBeenCalledTimes(1);
    // The trimmed confirmation is sent (server re-validates exact match).
    expect(mockRequestMutateAsync).toHaveBeenCalledWith('glow bar');
  });

  it('uses the venue name from the server status payload over the prop', async () => {
    mockStatusData = { venue_name: 'Server Name', deletion_scheduled_at: null };
    await render(<DeleteVenueSheet visible venueName="Stale Prop" onClose={jest.fn()} />);

    const field = screen.getByPlaceholderText('Server Name');
    await act(async () => {
      fireEvent.changeText(field, 'Server Name');
    });
    await press(() => screen.getByText('Schedule venue deletion'));
    expect(mockRequestMutateAsync).toHaveBeenCalledWith('Server Name');
  });
});

describe('DeleteVenueSheet — scheduled state (cancel path)', () => {
  it('shows the scheduled date and cancels on demand', async () => {
    mockStatusData = { venue_name: 'Glow Bar', deletion_scheduled_at: '2026-07-31T00:00:00.000Z' };
    await render(<DeleteVenueSheet visible venueName="Glow Bar" onClose={jest.fn()} />);

    expect(screen.getByText('Deletion scheduled')).toBeTruthy();
    // The request form is not shown in the scheduled state.
    expect(screen.queryByText('Schedule venue deletion')).toBeNull();

    await press(() => screen.getByText('Cancel scheduled deletion'));
    expect(mockCancelMutateAsync).toHaveBeenCalledTimes(1);
  });
});

describe('DeleteVenueSheet — loading', () => {
  it('shows a loading note before the status resolves', async () => {
    mockStatusData = undefined;
    mockStatusState = { isSuccess: false, isError: false };
    await render(<DeleteVenueSheet visible venueName="Glow Bar" onClose={jest.fn()} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText('Schedule venue deletion')).toBeNull();
  });
});
