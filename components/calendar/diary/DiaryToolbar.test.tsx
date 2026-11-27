import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { DiaryToolbar, type DiaryToolbarProps } from '@/components/calendar/diary/DiaryToolbar';
import type { Practitioner } from '@/types/practitioner';

const alex = { id: 'cal-1', name: 'Alex', is_active: true } as Practitioner;
const jo = { id: 'cal-2', name: 'Jo', is_active: true } as Practitioner;

function props(extra: Partial<DiaryToolbarProps> = {}): DiaryToolbarProps {
  return {
    scope: 'day',
    setScope: jest.fn(),
    isLinkedActive: false,
    clearOwnerVenue: jest.fn(),
    liveState: 'idle' as DiaryToolbarProps['liveState'],
    compactDay: false,
    setCompactDay: jest.fn(),
    anchor: '2026-11-27',
    today: '2026-11-27',
    setAmendHoursTarget: jest.fn(),
    setToolsOpen: jest.fn(),
    step: jest.fn(),
    setMonthPickerOpen: jest.fn(),
    label: 'Friday 27 November',
    isToday: true,
    goToday: jest.fn(),
    showChips: true,
    isWideDay: false,
    totalDayCount: 3,
    visibleIds: null,
    selectAllCalendars: jest.fn(),
    workingHoursOnly: false,
    setWorkingHoursOnly: jest.fn(),
    practitioners: [alex, jo],
    perPractitionerCounts: { 'cal-1': 2, 'cal-2': 1 },
    toggleVisibleCalendar: jest.fn(),
    linkedEntries: [],
    isAllView: false,
    isWeekAllView: false,
    selectedId: 'cal-1',
    ALL_CALENDARS: 'all',
    setSelectedId: jest.fn(),
    effectiveId: 'cal-1',
    ownerVenueId: null,
    activeLinkedCalendarId: null,
    setOwnerVenueId: jest.fn(),
    ...extra,
  };
}

describe('DiaryToolbar', () => {
  beforeEach(() => mockPush.mockClear());

  it('steps the date and opens the date picker', async () => {
    const p = props();
    await render(<DiaryToolbar {...p} />);
    await fireEvent.press(screen.getByLabelText('Previous'));
    expect(p.step).toHaveBeenCalledWith(-1);
    await fireEvent.press(screen.getByLabelText('Next'));
    expect(p.step).toHaveBeenCalledWith(1);
    await fireEvent.press(screen.getByLabelText('Friday 27 November'));
    expect(p.setMonthPickerOpen).toHaveBeenCalledWith(true);
  });

  it('shows the Today pill only away from today', async () => {
    await render(<DiaryToolbar {...props()} />);
    expect(screen.queryByLabelText('Jump to today')).toBeNull();
    const p = props({ isToday: false, anchor: '2026-11-28' });
    await render(<DiaryToolbar {...p} />);
    await fireEvent.press(screen.getByLabelText('Jump to today'));
    expect(p.goToday).toHaveBeenCalled();
  });

  it('opens Today and the More sheet', async () => {
    const p = props();
    await render(<DiaryToolbar {...p} />);
    await fireEvent.press(screen.getByLabelText('Open Today overview'));
    expect(mockPush).toHaveBeenCalledWith('/today');
    await fireEvent.press(screen.getByLabelText('More: search contacts, colour key'));
    expect(p.setToolsOpen).toHaveBeenCalledWith(true);
  });

  it('switches to another calendar, and to everyone', async () => {
    const p = props();
    await render(<DiaryToolbar {...p} />);
    await fireEvent.press(screen.getByText('Jo'));
    expect(p.clearOwnerVenue).toHaveBeenCalled();
    expect(p.setSelectedId).toHaveBeenCalledWith('cal-2');
    await fireEvent.press(screen.getByText('All'));
    expect(p.setSelectedId).toHaveBeenCalledWith('all');
  });

  it('toggles columns on a wide day', async () => {
    const p = props({ isWideDay: true });
    await render(<DiaryToolbar {...p} />);
    await fireEvent.press(screen.getByText('Jo'));
    expect(p.toggleVisibleCalendar).toHaveBeenCalledWith('cal-2');
    await fireEvent.press(screen.getByText('All'));
    expect(p.selectAllCalendars).toHaveBeenCalled();
    expect(screen.getByText('Working today')).toBeTruthy();
  });

  it('offers Amend hours in the toolbar only in the month', async () => {
    await render(<DiaryToolbar {...props()} />);
    expect(screen.queryByLabelText('Amend hours')).toBeNull();
    const p = props({ scope: 'month', showChips: false });
    await render(<DiaryToolbar {...p} />);
    await fireEvent.press(screen.getByLabelText('Amend hours'));
    expect(p.setAmendHoursTarget).toHaveBeenCalledWith({ date: '2026-11-27' });
  });
});
