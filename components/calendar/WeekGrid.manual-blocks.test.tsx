/**
 * Time blocked by hand shows on the week too (web parity), so a day that looks free there really is,
 * in the same solid grey as the day grid, and a tap opens it for that day.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { manualBlockLook } from '@/components/calendar/closure-band';
import { WeekGrid, type WeekDayColumn } from '@/components/calendar/WeekGrid';

function column(date: string, over: Partial<WeekDayColumn> = {}): WeekDayColumn {
  return {
    date,
    weekdayLabel: 'Wed',
    dayNumber: date.slice(-2),
    isToday: false,
    isWeekend: false,
    workingHours: [{ start: '09:00', end: '17:00' }],
    bookings: [],
    sessions: [],
    scheduleBlocks: [],
    venueHours: { kind: 'open', periods: [{ start: 0, end: 1440 }] } as unknown as WeekDayColumn['venueHours'],
    ...over,
  };
}

const LUNCH = { id: 'b1', start: '12:00', end: '13:00', label: 'Lunch', isEditable: true, blockType: 'manual' };
const UNNAMED = { id: 'b2', start: '18:00', end: '19:00', label: null, isEditable: true, blockType: 'manual' };

async function renderWeek(onManualBlockPress = jest.fn()) {
  await render(
    <WeekGrid
      days={[column('2026-11-04', { manualBlocks: [LUNCH, UNNAMED] }), column('2026-11-05')]}
      nowMinutes={null}
      onBlockPress={jest.fn()}
      onEmptyPress={jest.fn()}
      onManualBlockPress={onManualBlockPress}
      onDayPress={jest.fn()}
    />,
  );
}

describe('WeekGrid — manual blocks', () => {
  it('shows each block with its reason, or says Blocked', async () => {
    await renderWeek();
    expect(screen.getByLabelText('Lunch 12:00 to 13:00, tap to edit')).toBeTruthy();
    expect(screen.getByLabelText('Blocked 18:00 to 19:00, tap to edit')).toBeTruthy();
  });

  it('draws them in the same solid grey as the day grid', async () => {
    await renderWeek();
    const style = StyleSheet.flatten(screen.getByLabelText('Lunch 12:00 to 13:00, tap to edit').props.style);
    expect(style.backgroundColor).toBe(manualBlockLook(false).backgroundColor);
  });

  it('reports the day and the block when one is tapped', async () => {
    const onPress = jest.fn();
    await renderWeek(onPress);
    fireEvent.press(screen.getByLabelText('Lunch 12:00 to 13:00, tap to edit'));
    expect(onPress).toHaveBeenCalledWith('2026-11-04', 'b1');
  });
});
