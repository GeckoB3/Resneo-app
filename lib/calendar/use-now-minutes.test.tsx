import { act, renderHook } from '@testing-library/react-native';

import { useNowMinutes } from '@/lib/calendar/use-now-minutes';

describe('useNowMinutes', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-27T09:30:00Z') });
  });
  afterEach(() => jest.useRealTimers());

  it('is null when the day on screen is not today', async () => {
    const { result } = await renderHook(() => useNowMinutes('UTC', false));
    expect(result.current).toBeNull();
  });

  it('reads the venue clock and moves on each minute', async () => {
    const { result } = await renderHook(() => useNowMinutes('UTC', true));
    expect(result.current).toBe(9 * 60 + 30);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(9 * 60 + 31);
  });
});
