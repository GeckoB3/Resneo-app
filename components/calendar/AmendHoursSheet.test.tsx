import { render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
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

import {
  AmendHoursSheet,
  amendBusinessHoursHref,
  amendCalendarHoursHref,
} from '@/components/calendar/AmendHoursSheet';

/**
 * The diary's clock button (web `CalendarHoursQuickEdit`): admins choose
 * between calendar hours and business hours; staff go straight to calendar
 * hours. Both land on the real settings screens with the diary's day.
 */
describe('AmendHoursSheet', () => {
  beforeEach(() => mockPush.mockClear());

  it('sends calendar hours to the closures tab with the day and calendar, business hours with the day', () => {
    expect(amendCalendarHoursHref({ date: '2026-09-11', calendarId: 'cal-1' })).toEqual({
      pathname: '/availability',
      params: { tab: 'daysoff', date: '2026-09-11', calendar: 'cal-1' },
    });
    expect(amendCalendarHoursHref({ date: '2026-09-11' })).toEqual({
      pathname: '/availability',
      params: { tab: 'daysoff', date: '2026-09-11' },
    });
    expect(amendBusinessHoursHref({ date: '2026-09-11' })).toEqual({
      pathname: '/manage/hours',
      params: { date: '2026-09-11' },
    });
  });

  it('offers an admin both destinations', async () => {
    await render(<AmendHoursSheet target={{ date: '2026-09-11' }} isAdmin onClose={jest.fn()} />);
    expect(screen.getByLabelText('Amend calendar hours')).toBeTruthy();
    expect(screen.getByLabelText('Amend business hours')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('takes a staff member straight to calendar hours', async () => {
    const onClose = jest.fn();
    await render(
      <AmendHoursSheet target={{ date: '2026-09-11', calendarId: 'cal-1' }} isAdmin={false} onClose={onClose} />,
    );
    expect(mockPush).toHaveBeenCalledWith(amendCalendarHoursHref({ date: '2026-09-11', calendarId: 'cal-1' }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByLabelText('Amend business hours')).toBeNull();
  });
});
