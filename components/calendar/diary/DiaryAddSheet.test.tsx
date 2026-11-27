import { fireEvent, render, screen } from '@testing-library/react-native';

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

import { DiaryAddSheet, type DiaryAddSheetProps } from '@/components/calendar/diary/DiaryAddSheet';
import { ROLES_COPY, type DiaryScope } from '@/lib/roles/roles';
import type { Practitioner } from '@/types/practitioner';
import type { Resource } from '@/types/resources-manage';
import type { VenueTerminology } from '@/types/venue';

const openDiary = { allows: () => true } as unknown as DiaryScope;

function props(extra: Partial<DiaryAddSheetProps> = {}): DiaryAddSheetProps {
  return {
    addSheetTarget: { kind: 'fab' },
    closeAddSheet: jest.fn(),
    nowMinutes: 9 * 60 + 5,
    diary: openDiary,
    blockableCalendars: [{ id: 'cal-1', name: 'Alex' } as Practitioner],
    linkedContextActive: false,
    staffCollective: null,
    venue: null,
    activeResources: [],
    anchor: '2026-11-27',
    terminology: { client: 'client', booking: 'booking' } as unknown as VenueTerminology,
    isAppointmentVenue: true,
    collectiveParamsFor: () => ({}),
    setBlockTarget: jest.fn(),
    effectiveId: 'cal-1',
    ...extra,
  };
}

describe('DiaryAddSheet', () => {
  beforeEach(() => mockPush.mockClear());

  it('is closed with no target', async () => {
    await render(<DiaryAddSheet {...props({ addSheetTarget: null })} />);
    expect(screen.queryByText('Add to calendar')).toBeNull();
  });

  it('starts a walk-in from the FAB at the current time', async () => {
    const p = props();
    await render(<DiaryAddSheet {...p} />);
    expect(screen.getByText('Add to calendar')).toBeTruthy();
    await fireEvent.press(screen.getByText('Walk-in'));
    expect(p.closeAddSheet).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/booking/new',
      params: { date: '2026-11-27', time: '09:05', intent: 'walk-in' },
    });
  });

  it('books a tapped slot on its column', async () => {
    await render(
      <DiaryAddSheet {...props({ addSheetTarget: { kind: 'slot', time: '14:30', practitionerId: 'cal-1' } })} />,
    );
    expect(screen.getByText('Add at 14:30')).toBeTruthy();
    await fireEvent.press(screen.getByText('New booking'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/booking/new',
      params: { date: '2026-11-27', practitionerId: 'cal-1', time: '14:30' },
    });
  });

  it('blocks time on the tapped column', async () => {
    const p = props({ addSheetTarget: { kind: 'slot', time: '14:30', practitionerId: 'cal-1' } });
    await render(<DiaryAddSheet {...p} />);
    await fireEvent.press(screen.getByText('Block time'));
    expect(p.setBlockTarget).toHaveBeenCalledWith({
      mode: 'create',
      practitionerId: 'cal-1',
      date: '2026-11-27',
      startTime: '14:30',
    });
  });

  it('offers only the column resources on a look-only column', async () => {
    const lookOnly = { allows: () => false } as unknown as DiaryScope;
    await render(
      <DiaryAddSheet
        {...props({
          diary: lookOnly,
          addSheetTarget: { kind: 'slot', time: '10:00', practitionerId: 'cal-2' },
          activeResources: [{ id: 'r1', name: 'Room 1', display_on_calendar_id: 'cal-2' } as Resource],
        })}
      />,
    );
    expect(screen.getByText(ROLES_COPY['diary.new'])).toBeTruthy();
    expect(screen.queryByText('Walk-in')).toBeNull();
    await fireEvent.press(screen.getByText('Book Room 1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/booking/new',
      params: { tab: 'resource', resourceId: 'r1', date: '2026-11-27' },
    });
  });
});
