/**
 * F5 — persisted calendar prefs hook (SecureStore-backed).
 *
 * Exercises the JSON round-trip + hydrate lifecycle against an in-memory stub of
 * expo-secure-store (the real module is native-only), and the pure
 * `pruneStaleSelectedId` guard that drops a selected calendar id which no longer
 * exists (mirrors `reconcileOwnerVenue`).
 */
import { renderHook, waitFor, act } from '@testing-library/react-native';

// In-memory SecureStore — `mock`-prefixed so jest's hoisted factory can reference it.
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

// jest-expo defaults Platform.OS to 'ios', so the hook takes the persisting
// (non-web) branch without any Platform mock — the same as LinkedVenueProvider.

import {
  DEFAULT_CALENDAR_PREFS,
  pruneStaleSelectedId,
  pruneVisibleCalendarIds,
  usePersistedCalendarPrefs,
  type CalendarPrefs,
} from '@/lib/queries/usePersistedCalendarPrefs';

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('pruneStaleSelectedId', () => {
  const base: CalendarPrefs = {
    scope: 'week',
    selectedId: 'cal_2',
    visibleIds: null,
    startHourOverride: 8,
    endHourOverride: 20,
    compactDay: false,
  };

  it('keeps a selectedId that still exists (same reference back)', () => {
    const out = pruneStaleSelectedId(base, ['cal_1', 'cal_2', 'cal_3']);
    expect(out).toBe(base); // unchanged → same object reference
    expect(out.selectedId).toBe('cal_2');
  });

  it('drops a selectedId that no longer exists', () => {
    const out = pruneStaleSelectedId(base, ['cal_1', 'cal_3']);
    expect(out).not.toBe(base);
    expect(out.selectedId).toBeNull();
    // other fields preserved
    expect(out.scope).toBe('week');
    expect(out.startHourOverride).toBe(8);
  });

  it('always preserves the "all" sentinel and a null selection', () => {
    const all = { ...base, selectedId: 'all' };
    expect(pruneStaleSelectedId(all, [])).toBe(all);
    const none = { ...base, selectedId: null };
    expect(pruneStaleSelectedId(none, [])).toBe(none);
  });
});

describe('pruneVisibleCalendarIds', () => {
  it('returns null for the all-calendars default', () => {
    expect(pruneVisibleCalendarIds(null, ['cal_1', 'cal_2'])).toBeNull();
  });

  it('keeps a genuine proper subset of valid ids', () => {
    expect(pruneVisibleCalendarIds(['cal_1'], ['cal_1', 'cal_2', 'cal_3'])).toEqual(['cal_1']);
  });

  it('drops ids that no longer exist', () => {
    expect(pruneVisibleCalendarIds(['cal_1', 'gone'], ['cal_1', 'cal_2'])).toEqual(['cal_1']);
  });

  it('collapses an empty result to null (all calendars)', () => {
    expect(pruneVisibleCalendarIds(['gone'], ['cal_1', 'cal_2'])).toBeNull();
  });

  it('preserves linked-venue keys even though they are not own calendar ids', () => {
    expect(pruneVisibleCalendarIds(['cal_1', 'linked:v9'], ['cal_1', 'cal_2'])).toEqual([
      'cal_1',
      'linked:v9',
    ]);
  });

  it('keeps a linked-only selection (own all deleted) rather than collapsing it', () => {
    expect(pruneVisibleCalendarIds(['linked:v9'], ['cal_1', 'cal_2'])).toEqual(['linked:v9']);
  });
});

describe('usePersistedCalendarPrefs', () => {
  it('starts on defaults and hydrates an empty store to defaults', async () => {
    const { result } = await renderHook(() => usePersistedCalendarPrefs('venue_1'));

    // First resolved render = defaults.
    expect(result.current.prefs).toEqual(DEFAULT_CALENDAR_PREFS);

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.prefs).toEqual(DEFAULT_CALENDAR_PREFS);
  });

  it('persists a partial update and re-hydrates it on a fresh mount', async () => {
    const first = await renderHook(() => usePersistedCalendarPrefs('venue_1'));
    await waitFor(() => expect(first.result.current.hydrated).toBe(true));

    await act(async () => {
      first.result.current.setPrefs({ scope: 'week', selectedId: 'cal_9', startHourOverride: 7 });
    });
    expect(first.result.current.prefs.scope).toBe('week');
    expect(first.result.current.prefs.selectedId).toBe('cal_9');

    // A brand-new hook instance for the same venue must read the persisted value.
    const second = await renderHook(() => usePersistedCalendarPrefs('venue_1'));
    await waitFor(() => expect(second.result.current.hydrated).toBe(true));
    expect(second.result.current.prefs).toEqual({
      scope: 'week',
      selectedId: 'cal_9',
      visibleIds: null,
      startHourOverride: 7,
      endHourOverride: null,
      compactDay: false,
    });
  });

  it('round-trips the compact-day toggle across a fresh mount', async () => {
    const first = await renderHook(() => usePersistedCalendarPrefs('venue_1'));
    await waitFor(() => expect(first.result.current.hydrated).toBe(true));
    await act(async () => {
      first.result.current.setPrefs({ compactDay: true });
    });

    const second = await renderHook(() => usePersistedCalendarPrefs('venue_1'));
    await waitFor(() => expect(second.result.current.hydrated).toBe(true));
    expect(second.result.current.prefs.compactDay).toBe(true);
  });

  it('round-trips a visibleIds subset across a fresh mount', async () => {
    const first = await renderHook(() => usePersistedCalendarPrefs('venue_1'));
    await waitFor(() => expect(first.result.current.hydrated).toBe(true));
    await act(async () => {
      first.result.current.setPrefs({ visibleIds: ['cal_1', 'cal_3'] });
    });

    const second = await renderHook(() => usePersistedCalendarPrefs('venue_1'));
    await waitFor(() => expect(second.result.current.hydrated).toBe(true));
    expect(second.result.current.prefs.visibleIds).toEqual(['cal_1', 'cal_3']);
  });

  it('scopes storage by venue id (venue_2 does not see venue_1 prefs)', async () => {
    const v1 = await renderHook(() => usePersistedCalendarPrefs('venue_1'));
    await waitFor(() => expect(v1.result.current.hydrated).toBe(true));
    await act(async () => {
      v1.result.current.setPrefs({ selectedId: 'cal_1' });
    });

    const v2 = await renderHook(() => usePersistedCalendarPrefs('venue_2'));
    await waitFor(() => expect(v2.result.current.hydrated).toBe(true));
    expect(v2.result.current.prefs.selectedId).toBeNull();
  });

  it('clearPrefs wipes the persisted value back to defaults', async () => {
    const { result } = await renderHook(() => usePersistedCalendarPrefs('venue_1'));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await act(async () => {
      result.current.setPrefs({ selectedId: 'cal_5', scope: 'month' });
    });
    await act(async () => {
      result.current.clearPrefs();
    });
    expect(result.current.prefs).toEqual(DEFAULT_CALENDAR_PREFS);

    // Persisted value is gone — a fresh mount hydrates to defaults.
    const again = await renderHook(() => usePersistedCalendarPrefs('venue_1'));
    await waitFor(() => expect(again.result.current.hydrated).toBe(true));
    expect(again.result.current.prefs).toEqual(DEFAULT_CALENDAR_PREFS);
  });

  it('does not touch storage when venueId is null', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store');
    const { result } = await renderHook(() => usePersistedCalendarPrefs(null));
    expect(result.current.prefs).toEqual(DEFAULT_CALENDAR_PREFS);
    expect(result.current.hydrated).toBe(false);
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();

    await act(async () => {
      result.current.setPrefs({ scope: 'week' });
    });
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('coerces a corrupt stored blob to complete defaults', async () => {
    mockStore.set(
      'reserveni.calendar.prefs.venue_1',
      JSON.stringify({ scope: 'nonsense', selectedId: 42, startHourOverride: 'x' }),
    );
    const { result } = await renderHook(() => usePersistedCalendarPrefs('venue_1'));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.prefs).toEqual(DEFAULT_CALENDAR_PREFS);
  });

  it('coerces a non-boolean compactDay (and a pre-compact stored blob) to false', async () => {
    // A blob persisted before the compactDay field existed has no such key;
    // a corrupt one may hold a truthy non-boolean. Both must coerce to false.
    mockStore.set(
      'reserveni.calendar.prefs.venue_1',
      JSON.stringify({ scope: 'day', selectedId: 'cal_1', compactDay: 'yes' }),
    );
    const { result } = await renderHook(() => usePersistedCalendarPrefs('venue_1'));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.prefs.compactDay).toBe(false);
    expect(result.current.prefs.selectedId).toBe('cal_1');
  });
});
