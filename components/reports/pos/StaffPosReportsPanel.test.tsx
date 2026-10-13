/**
 * A team member's Reports (Takings and Sales only, with `view_reports`) get the same Calendar
 * picker as an admin's, kept while moving between the two tabs.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { ReportCalendarOption } from '@/types/reports';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, { testID: 'calendar-sheet' }, children) : null,
  };
});

let mockCalendars: ReportCalendarOption[] = [];
const mockCalendarsEnabled: unknown[] = [];
const mockAllowBusinesses: unknown[] = [];
jest.mock('@/lib/queries/useReportCalendars', () => ({
  useReportCalendars: (enabled: unknown, allowBusinesses: unknown) => {
    mockCalendarsEnabled.push(enabled);
    mockAllowBusinesses.push(allowBusinesses);
    return { data: { venue: null, calendars: mockCalendars, businesses: [], together: null } };
  },
}));

/** What a mocked section reads from the panel's calendar filter: "takings calendar: Hannah". */
function MockCalendarText({ label }: { label: string }) {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const { useReportCalendar } = jest.requireActual<typeof import('@/components/reports/ReportCalendarFilter')>(
    '@/components/reports/ReportCalendarFilter',
  );
  return <Text>{`${label} calendar: ${useReportCalendar().calendar?.name ?? 'all'}`}</Text>;
}
jest.mock('@/components/reports/pos/TakingsSection', () => ({
  TakingsSection: () => <MockCalendarText label="takings" />,
}));
jest.mock('@/components/reports/pos/SalesSection', () => ({
  SalesSection: () => <MockCalendarText label="sales" />,
}));

import { StaffPosReportsPanel } from '@/components/reports/pos/StaffPosReportsPanel';

beforeEach(() => {
  mockCalendars = [];
  mockCalendarsEnabled.length = 0;
});

it('offers the Calendar picker on Sales, greys it out on Takings, and keeps the choice across both', async () => {
  mockCalendars = [
    { id: 'c1', name: 'Hannah', active: true },
    { id: 'c2', name: 'Jo', active: false },
  ];
  await render(<StaffPosReportsPanel canExport={false} today="2026-10-09" />);
  // The panel asks for the list itself: a team member's Reports have no admin screen around them.
  expect(mockCalendarsEnabled).toContain(true);
  // A team member is never offered a linked business or everyone together.
  expect(mockAllowBusinesses.every((allow) => allow === false)).toBe(true);
  // Takings is always the whole venue's: the picker is greyed out there, as on the web.
  expect(screen.getByRole('button', { name: 'Showing, All calendars' })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ disabled: true }),
  );
  await act(async () => {
    fireEvent.press(screen.getByRole('tab', { name: 'Sales' }));
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Showing, All calendars' }));
  });
  expect(screen.getAllByRole('radio').map((r) => r.props.accessibilityLabel)).toEqual([
    'All calendars',
    'Hannah',
    'Jo (no longer active)',
  ]);
  await act(async () => {
    fireEvent.press(screen.getByRole('radio', { name: 'Hannah' }));
  });
  expect(screen.getByText('sales calendar: Hannah')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByRole('tab', { name: 'Takings' }));
  });
  // The choice is kept for Sales while Takings shows the whole venue.
  expect(screen.getByText('takings calendar: Hannah')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Showing, All calendars' })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ disabled: true }),
  );
  await act(async () => {
    fireEvent.press(screen.getByRole('tab', { name: 'Sales' }));
  });
  expect(screen.getByRole('button', { name: 'Showing, Hannah' })).toBeTruthy();
});

it('shows no picker when the server lists fewer than two calendars for this login', async () => {
  mockCalendars = [{ id: 'c1', name: 'Hannah', active: true }];
  await render(<StaffPosReportsPanel canExport={false} today="2026-10-09" />);
  expect(screen.queryByRole('button', { name: 'Showing, All calendars' })).toBeNull();
  expect(screen.getByText('takings calendar: all')).toBeTruthy();
});
