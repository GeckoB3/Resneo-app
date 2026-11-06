/**
 * Today at the venue, kept current while the app is open, so a tablet left on the diary
 * overnight moves on to the new day.
 */
import { AppState, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

import { useVenueToday } from '@/lib/dates/use-venue-today';

function Today({ zone }: { zone: string }) {
  return <Text testID="today">{useVenueToday(zone)}</Text>;
}

let appStateListener: ((state: string) => void) | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: string) => void;
    return { remove: () => { appStateListener = null; } } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("moves on at the venue's midnight while the screen stays open", async () => {
  jest.setSystemTime(new Date('2026-11-06T23:59:00Z'));
  await render(<Today zone="Europe/London" />);
  expect(screen.getByTestId('today')).toHaveTextContent('2026-11-06');
  await act(async () => {
    jest.setSystemTime(new Date('2026-11-07T00:00:30Z'));
    jest.advanceTimersByTime(60_000);
  });
  expect(screen.getByTestId('today')).toHaveTextContent('2026-11-07');
});

it('checks again when the app comes back to the front', async () => {
  jest.setSystemTime(new Date('2026-11-06T22:00:00Z'));
  await render(<Today zone="Europe/London" />);
  await act(async () => {
    jest.setSystemTime(new Date('2026-11-07T07:30:00Z'));
    appStateListener?.('active');
  });
  expect(screen.getByTestId('today')).toHaveTextContent('2026-11-07');
});

it("follows the venue's timezone", async () => {
  // 23:30 in London is already the next day in Athens.
  jest.setSystemTime(new Date('2026-11-06T23:30:00Z'));
  await render(<Today zone="Europe/Athens" />);
  expect(screen.getByTestId('today')).toHaveTextContent('2026-11-07');
});
