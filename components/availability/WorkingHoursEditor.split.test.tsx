/**
 * WorkingHoursEditor — R19-2 (split shifts) and R19-4 (venue-hours context).
 *
 * R19-2: "+ Add split" appended a hardcoded 09:00–17:00, so on a calendar
 * working 09:00–17:00 the first press produced a duplicate identical row, and
 * there was no end-of-day guard at all.
 *
 * R19-4: hours set outside the venue's opening hours are not rejected — they
 * simply never become bookable — so the editor has to say so.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

// Native date picker pulled in by TimePickerField — stub to a host element.
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockMutateAsync = jest.fn();
jest.mock('@/lib/queries/useAvailabilityManage', () => ({
  usePatchPractitioner: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

import { WorkingHoursEditor } from '@/components/availability/WorkingHoursEditor';
import type { OpeningHours } from '@/types/venue';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

const onClose = jest.fn();

beforeEach(() => {
  mockMutateAsync.mockReset().mockResolvedValue({ ok: true });
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  onClose.mockReset();
});

describe('WorkingHoursEditor — adding a split shift', () => {
  it('starts the new split after the previous one, not at a fixed default', async () => {
    await render(
      <WorkingHoursEditor
        practitionerId="prac_1"
        practitionerName="Alex"
        currentWorkingHours={{ '1': [{ start: '09:00', end: '17:00' }] }}
        onClose={onClose}
      />,
    );

    await press(() => screen.getAllByText('+ Add split')[0]!);
    await press(() => screen.getByText('Save hours'));

    const saved = mockMutateAsync.mock.calls[0]![0].working_hours['1'];
    expect(saved).toEqual([
      { start: '09:00', end: '17:00' },
      // An hour's gap after the previous close, an hour long — NOT 09:00–17:00.
      { start: '18:00', end: '19:00' },
    ]);
  });

  it('never hands back a duplicate of the range before it', async () => {
    await render(
      <WorkingHoursEditor
        practitionerId="prac_1"
        practitionerName="Alex"
        currentWorkingHours={{ '1': [{ start: '09:00', end: '17:00' }] }}
        onClose={onClose}
      />,
    );

    await press(() => screen.getAllByText('+ Add split')[0]!);
    await press(() => screen.getAllByText('+ Add split')[0]!);
    await press(() => screen.getByText('Save hours'));

    const saved = mockMutateAsync.mock.calls[0]![0].working_hours['1'] as {
      start: string;
      end: string;
    }[];
    const signatures = saved.map((r) => `${r.start}-${r.end}`);
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('replaces the button with an explanation when the day is full', async () => {
    await render(
      <WorkingHoursEditor
        practitionerId="prac_1"
        practitionerName="Alex"
        // Ends at 23:30, so another hour-long period will not fit before 23:59.
        currentWorkingHours={{ '1': [{ start: '20:00', end: '23:30' }] }}
        onClose={onClose}
      />,
    );

    expect(
      screen.getByText(
        'The last period runs to the end of the day, so there is no room for another one.',
      ),
    ).toBeTruthy();
    // Monday is the only open day, so no Add control should be on screen.
    expect(screen.queryByText('+ Add split')).toBeNull();
  });
});

describe('WorkingHoursEditor — venue hours context', () => {
  const mondayOnly = { '1': [{ start: '09:00', end: '17:00' }] };

  it('shows nothing when the venue has never set opening hours', async () => {
    await render(
      <WorkingHoursEditor
        practitionerId="prac_1"
        practitionerName="Alex"
        currentWorkingHours={mondayOnly}
        onClose={onClose}
      />,
    );
    expect(screen.queryByText(/^Venue: /)).toBeNull();
  });

  it('prints the venue hours for the day without a warning when they contain the calendar', async () => {
    const venueHours = { '1': { periods: [{ open: '08:00', close: '18:00' }] } } as OpeningHours;
    await render(
      <WorkingHoursEditor
        practitionerId="prac_1"
        practitionerName="Alex"
        currentWorkingHours={mondayOnly}
        venueOpeningHours={venueHours}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('Venue: 08:00 to 18:00')).toBeTruthy();
    expect(screen.queryByText(/not bookable/)).toBeNull();
  });

  it('warns when the calendar reaches past the venue hours', async () => {
    const venueHours = { '1': { periods: [{ open: '09:00', close: '12:00' }] } } as OpeningHours;
    await render(
      <WorkingHoursEditor
        practitionerId="prac_1"
        practitionerName="Alex"
        currentWorkingHours={mondayOnly}
        venueOpeningHours={venueHours}
        onClose={onClose}
      />,
    );
    expect(
      screen.getByText('Venue: 09:00 to 12:00 (hours outside this are not bookable)'),
    ).toBeTruthy();
  });

  it('warns on a day the venue is closed but the calendar works', async () => {
    const venueHours = { '1': { closed: true } } as OpeningHours;
    await render(
      <WorkingHoursEditor
        practitionerId="prac_1"
        practitionerName="Alex"
        currentWorkingHours={mondayOnly}
        venueOpeningHours={venueHours}
        onClose={onClose}
      />,
    );
    expect(
      screen.getByText('Venue: Venue closed (hours outside this are not bookable)'),
    ).toBeTruthy();
  });

  it('does not warn about a venue-closed day the calendar is also closed on', async () => {
    const venueHours = { '0': { closed: true } } as OpeningHours;
    await render(
      <WorkingHoursEditor
        practitionerId="prac_1"
        practitionerName="Alex"
        currentWorkingHours={mondayOnly}
        venueOpeningHours={venueHours}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('Venue: Venue closed')).toBeTruthy();
    expect(screen.queryByText(/not bookable/)).toBeNull();
  });
});
