/**
 * The date the Calendar and Appointments tabs share: one day for both, kept until "Today" or
 * signing in again, and across launches for the login that picked it.
 */
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { addDaysToDateStr } from '@/lib/dates/venue-dates';

import {
  __resetSharedDiaryDateForTests,
  daysBetweenDateStrs,
  getSharedDiaryDate,
  parseDiaryDate,
  setSharedDiaryDate,
  startSharedDiaryDateHydration,
  syncSharedDiaryDateUser,
  useSharedDiaryDate,
} from '@/lib/dates/shared-diary-date';

const TODAY = '2026-11-06';
const KEY = 'resneo_diary_date_v1';

/** Press a button by its text (RNTL 14 renders and fires asynchronously). */
async function press(text: string) {
  await fireEvent.press(screen.getByText(text));
}

/** Let the fire-and-forget SecureStore writes land. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockStore.clear();
  __resetSharedDiaryDateForTests();
});

/** A stand-in for one tab: shows its date, steps it, and has a "Today" button. */
function Tab({ name }: { name: string }) {
  const [date, setDate] = useSharedDiaryDate(TODAY);
  return (
    <>
      <Text testID={`${name}-date`}>{date}</Text>
      <Pressable accessibilityRole="button" onPress={() => setDate('2026-12-24')}>
        <Text>{`${name} pick`}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          // Two arrow taps handled before a re-render.
          setDate((d) => addDaysToDateStr(d, 1));
          setDate((d) => addDaysToDateStr(d, 1));
        }}>
        <Text>{`${name} next twice`}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setDate(TODAY)}>
        <Text>{`${name} Today`}</Text>
      </Pressable>
    </>
  );
}

describe('the two tabs', () => {
  beforeEach(() => syncSharedDiaryDateUser('user-1'));

  it('start on today when nothing has been picked', async () => {
    await render(<Tab name="calendar" />);
    expect(screen.getByTestId('calendar-date')).toHaveTextContent(TODAY);
  });

  it('share one date: picking a day on the Calendar shows it on Appointments', async () => {
    await render(
      <>
        <Tab name="calendar" />
        <Tab name="appointments" />
      </>,
    );
    await press('calendar pick');
    expect(screen.getByTestId('appointments-date')).toHaveTextContent('2026-12-24');
    expect(screen.getByTestId('calendar-date')).toHaveTextContent('2026-12-24');
  });

  it('keep the day when a screen is left and opened again', async () => {
    const first = await render(<Tab name="appointments" />);
    await press('appointments pick');
    await act(async () => {
      first.unmount();
    });
    await render(<Tab name="calendar" />);
    expect(screen.getByTestId('calendar-date')).toHaveTextContent('2026-12-24');
  });

  it('go back to today on "Today", which stores nothing so the day then follows the calendar', async () => {
    await render(<Tab name="appointments" />);
    await press('appointments pick');
    await flush();
    expect(mockStore.has(KEY)).toBe(true);
    await press('appointments Today');
    await flush();
    expect(screen.getByTestId('appointments-date')).toHaveTextContent(TODAY);
    expect(getSharedDiaryDate()).toBeNull();
    expect(mockStore.has(KEY)).toBe(false);
  });

  it('step from the latest date, so quick taps on the arrows do not land short', async () => {
    await render(<Tab name="calendar" />);
    await press('calendar next twice');
    expect(screen.getByTestId('calendar-date')).toHaveTextContent('2026-11-08');
  });
});

describe('signing out and in', () => {
  it('forgets the day when nobody is signed in, so the next sign-in starts on today', async () => {
    syncSharedDiaryDateUser('user-1');
    setSharedDiaryDate('2026-12-24', TODAY);
    await flush();
    syncSharedDiaryDateUser(null);
    await flush();
    expect(getSharedDiaryDate()).toBeNull();
    expect(mockStore.has(KEY)).toBe(false);
    syncSharedDiaryDateUser('user-1');
    expect(getSharedDiaryDate()).toBeNull();
  });

  it('keeps the day across a relaunch for the same login', async () => {
    syncSharedDiaryDateUser('user-1');
    setSharedDiaryDate('2026-12-24', TODAY);
    await flush();
    __resetSharedDiaryDateForTests();
    await startSharedDiaryDateHydration();
    syncSharedDiaryDateUser('user-1');
    expect(getSharedDiaryDate()).toBe('2026-12-24');
  });

  it('drops a day picked by a different login', async () => {
    syncSharedDiaryDateUser('user-1');
    setSharedDiaryDate('2026-12-24', TODAY);
    await flush();
    __resetSharedDiaryDateForTests();
    await startSharedDiaryDateHydration();
    syncSharedDiaryDateUser('user-2');
    await flush();
    expect(getSharedDiaryDate()).toBeNull();
    expect(mockStore.has(KEY)).toBe(false);
  });

  it('waits for the stored day before judging it, when the login is known first', async () => {
    mockStore.set(KEY, JSON.stringify({ userId: 'user-1', date: '2026-12-24' }));
    const hydration = startSharedDiaryDateHydration();
    syncSharedDiaryDateUser('user-1');
    await hydration;
    await flush();
    expect(getSharedDiaryDate()).toBe('2026-12-24');
  });
});

describe('helpers', () => {
  it('accepts only real dates', () => {
    expect(parseDiaryDate('2026-11-20')).toBe('2026-11-20');
    expect(parseDiaryDate('2026-02-30')).toBeNull();
    expect(parseDiaryDate('20/11/2026')).toBeNull();
    expect(parseDiaryDate(42)).toBeNull();
  });

  it('ignores a value that is not a date', () => {
    syncSharedDiaryDateUser('user-1');
    setSharedDiaryDate('2026-12-24', TODAY);
    setSharedDiaryDate('nonsense', TODAY);
    expect(getSharedDiaryDate()).toBe('2026-12-24');
  });

  it('counts days between dates, across a month end and backwards', () => {
    expect(daysBetweenDateStrs('2026-11-06', '2026-11-13')).toBe(7);
    expect(daysBetweenDateStrs('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysBetweenDateStrs('2026-11-13', '2026-11-06')).toBe(-7);
    expect(daysBetweenDateStrs('2026-10-24', '2026-10-26')).toBe(2);
  });
});
