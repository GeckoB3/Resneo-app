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
jest.mock('@/components/manage/OpeningHoursEditor', () => {
  const { Pressable, Text } = require('react-native');
  return {
    OpeningHoursEditor: ({ onChange }: { onChange: (v: unknown) => void }) => (
      <Pressable onPress={() => onChange({ '1': { closed: true } })}>
        <Text>edit-hours</Text>
      </Pressable>
    ),
  };
});
jest.mock('@/components/manage/AvailabilityBlocksSection', () => ({
  AvailabilityBlocksSection: () => null,
}));

// Stack.Screen reads a navigator route via useRoute — stub it to render nothing.
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
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
