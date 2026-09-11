/**
 * Business hours screen — "Save anyway?" 409 acknowledge flow (Availability High).
 *
 * Narrowing opening hours can orphan upcoming bookings; the route replies 409
 * `{ requires_confirmation, message }`. The screen must surface an armed
 * ConfirmSheet and re-save with `{ acknowledge: true }` on confirm. (Hook-level
 * query-param threading is covered by useAcknowledgeHoursFlow.test.)
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ApiError } from '@/lib/api/client';

// Heavy children — replace with light stubs. The OpeningHoursEditor stub exposes
// a button that fires onChange so the draft becomes dirty (Save enabled).
const mockSeededDrafts: Record<string, unknown>[] = [];
jest.mock('@/components/manage/OpeningHoursEditor', () => {
  const { Pressable, Text } = require('react-native');
  return {
    OpeningHoursEditor: ({
      value,
      onChange,
    }: {
      value: Record<string, unknown>;
      onChange: (v: unknown) => void;
    }) => {
      mockSeededDrafts.push(value);
      return (
        <Pressable onPress={() => onChange({ '1': { closed: true } })}>
          <Text>edit-hours</Text>
        </Pressable>
      );
    },
  };
});
jest.mock('@/components/manage/AvailabilityBlocksSection', () => ({
  AvailabilityBlocksSection: () => null,
}));

// Stack.Screen reads a navigator route via useRoute — stub it to render nothing.
// `useLocalSearchParams` feeds the clock button's `?date=`; `useRouter` the
// hours-mismatch advice's button (R33).
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn() }),
}));

// The roster behind the after-save advice (R33-5); empty here.
jest.mock('@/lib/queries/usePractitioners', () => ({
  usePractitioners: () => ({ data: undefined }),
}));

// Render Sheet children inline (avoids gesture-handler/Modal) when visible.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

const mockUpdateMutateAsync = jest.fn();
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useUpdateOpeningHours: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
}));

const mockVenue = {
  current_user_role: 'admin',
  opening_hours: { '1': { periods: [{ open: '09:00', close: '17:00' }] } },
};
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue, isLoading: false, refetch: jest.fn() }),
}));

import BusinessHoursScreen from '@/app/(app)/manage/hours';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => {
  mockUpdateMutateAsync.mockReset();
  mockSeededDrafts.length = 0;
});

describe('Business hours — the week the editor is given', () => {
  it('seeds all seven days, a stored partial map filled in as closed', async () => {
    /**
     * The venue row carries Monday only. A partial map is read two ways
     * downstream — the booking engine treats a missing weekday as closed, the
     * calendar-hours editor as "no business hours set" — so the screen seeds
     * (and therefore saves) the full week, as the web's `getDayConfig` +
     * `toOpeningHours` do.
     */
    await render(<BusinessHoursScreen />);

    const seeded = mockSeededDrafts[0]!;
    expect(Object.keys(seeded).sort()).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    expect(seeded['1']).toEqual({ periods: [{ open: '09:00', close: '17:00' }] });
    expect(seeded['0']).toEqual({ closed: true });
  });
});

describe('Business hours — Save anyway? (409)', () => {
  it('confirms then re-saves opening hours with acknowledge:true', async () => {
    mockUpdateMutateAsync
      .mockRejectedValueOnce(
        new ApiError('conflict', 409, {
          requires_confirmation: true,
          message: '3 bookings fall outside the new hours.',
        }),
      )
      .mockResolvedValueOnce({ opening_hours: {} });

    await render(<BusinessHoursScreen />);

    // Make the draft dirty so the Save button enables.
    await press(() => screen.getByText('edit-hours'));
    await press(() => screen.getByText('Save opening hours'));

    // Armed confirm with the server message; first save attempt had no acknowledge.
    expect(screen.getByText('Save these hours anyway?')).toBeTruthy();
    expect(screen.getByText('3 bookings fall outside the new hours.')).toBeTruthy();
    expect(mockUpdateMutateAsync.mock.calls[0][0].acknowledge).toBeUndefined();

    // Confirm → re-save carries acknowledge:true.
    await press(() => screen.getByText('Save anyway'));
    expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(2);
    expect(mockUpdateMutateAsync.mock.calls[1][0].acknowledge).toBe(true);
  });
});
