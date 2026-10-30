/**
 * The Reports Showing picker's parts: the picker (All calendars plus each calendar, the one no
 * longer active labelled; with businesses, a group for your venue, each business and everyone
 * together), what a section says about its figures, the whole-venue and till lines, and the
 * refusal with its way back to all calendars.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, { testID: 'calendar-sheet' }, children) : null,
  };
});

import {
  CalendarRefusal,
  CalendarScopeNote,
  ReportCalendarPicker,
  ReportCalendarProvider,
  useReportCalendar,
  useReportScopeQuery,
  WholeVenueNote,
} from '@/components/reports/ReportCalendarFilter';
import { resolveShowing, type ShowingChoice } from '@/lib/reports/report-scope';
import type { ReportShowingOptions } from '@/types/reports';

const OPTIONS = [
  { id: 'c1', name: 'Hannah', active: true },
  { id: 'c2', name: 'Jenny', active: true },
  { id: 'c3', name: 'Jo', active: false },
];
const HANNAH = { id: 'c1', name: 'Hannah' };

const OWN_ONLY: ReportShowingOptions = { venue: { id: 'v1', name: 'Plus 1' }, calendars: OPTIONS, businesses: [], together: null };
const WITH_BUSINESSES: ReportShowingOptions = {
  venue: { id: 'v1', name: 'Plus 1' },
  calendars: OPTIONS,
  businesses: [
    { venue_id: 'v2', name: 'Light 3', access: 'collective', all_calendars: true, calendars: [{ id: 'p1', name: 'Jess', active: true }] },
    { venue_id: 'v3', name: 'Aura', access: 'link', all_calendars: false, calendars: [{ id: 'p2', name: 'Kim', active: false }] },
  ],
  together: { name: 'Everyone together' },
};
const show = (options: ReportShowingOptions, choice: ShowingChoice) => resolveShowing(options, choice);
const VENUE = show(OWN_ONLY, { kind: 'venue' });

describe('ReportCalendarPicker', () => {
  it('reads "All calendars" until one is chosen, and lists each calendar in the server order', async () => {
    const onChange = jest.fn();
    await render(<ReportCalendarPicker options={OWN_ONLY} value={VENUE} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Showing, All calendars' })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByHintText('Opens the choices of what to show'));
    });
    expect(screen.getByText('Show figures for')).toBeTruthy();
    expect(screen.getAllByRole('radio').map((r) => r.props.accessibilityLabel)).toEqual([
      'All calendars',
      'Hannah',
      'Jenny',
      'Jo (no longer active)',
    ]);
    expect(screen.getByText('Some figures always cover the whole venue. They say so when you choose a calendar.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Jo (no longer active)' }));
    });
    expect(onChange).toHaveBeenCalledWith({ kind: 'calendar', calendarId: 'c3' });
    // Choosing closes the sheet.
    expect(screen.queryByTestId('calendar-sheet')).toBeNull();
  });

  it('is greyed out on a whole-venue tab, reading All calendars, and does not open', async () => {
    const onChange = jest.fn();
    await render(
      <ReportCalendarPicker options={OWN_ONLY} value={show(OWN_ONLY, { kind: 'calendar', calendarId: 'c1' })} onChange={onChange} disabled />,
    );
    const line = screen.getByRole('button', { name: 'Showing, All calendars' });
    expect(line).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
    await act(async () => {
      fireEvent.press(line);
    });
    expect(screen.queryByTestId('calendar-sheet')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('names the calendar chosen, and goes back to all calendars', async () => {
    const onChange = jest.fn();
    await render(
      <ReportCalendarPicker options={OWN_ONLY} value={show(OWN_ONLY, { kind: 'calendar', calendarId: 'c3' })} onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Showing, Jo (no longer active)' })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByHintText('Opens the choices of what to show'));
    });
    expect(screen.getByRole('radio', { name: 'Jo (no longer active)' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'All calendars' }));
    });
    expect(onChange).toHaveBeenCalledWith({ kind: 'venue' });
  });

  it('groups your venue, each business and everyone together, in that order', async () => {
    const onChange = jest.fn();
    await render(<ReportCalendarPicker options={WITH_BUSINESSES} value={show(WITH_BUSINESSES, { kind: 'venue' })} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Showing, Plus 1 (you): all calendars' })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByHintText('Opens the choices of what to show'));
    });
    // Your own venue reads "(you)" beside the businesses, which may share its name (CQ-07, W6-20).
    expect(screen.getAllByRole('radio').map((r) => r.props.accessibilityLabel)).toEqual([
      'Plus 1 (you): all calendars',
      'Hannah',
      'Jenny',
      'Jo (no longer active)',
      'Light 3: all calendars',
      'Jess',
      'Aura: shared calendars',
      'Kim (no longer active)',
      'Everyone together',
    ]);
    // Each group is headed with its business's name.
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual([
      'Show figures for',
      'Plus 1 (you)',
      'Light 3',
      'Aura',
      'Together',
    ]);
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Jess' }));
    });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'partner-calendar', venueId: 'v2', calendarId: 'p1' });
  });

  it('names a partner calendar with its business, and a business or everyone together by name', async () => {
    const onChange = jest.fn();
    const { rerender } = await render(
      <ReportCalendarPicker
        options={WITH_BUSINESSES}
        value={show(WITH_BUSINESSES, { kind: 'partner-calendar', venueId: 'v2', calendarId: 'p1' })}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'Showing, Jess at Light 3' })).toBeTruthy();
    await rerender(
      <ReportCalendarPicker options={WITH_BUSINESSES} value={show(WITH_BUSINESSES, { kind: 'business', venueId: 'v3' })} onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Showing, Aura: shared calendars' })).toBeTruthy();
    await rerender(
      <ReportCalendarPicker options={WITH_BUSINESSES} value={show(WITH_BUSINESSES, { kind: 'together' })} onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Showing, Everyone together' })).toBeTruthy();
  });
});

describe('what a section says', () => {
  function withCalendar(calendar: { id: string; name: string } | null, children: ReactNode, onClear = jest.fn()) {
    return (
      <ReportCalendarProvider calendar={calendar} onClear={onClear}>
        {children}
      </ReportCalendarProvider>
    );
  }

  it('names the calendar the answer is for, with what its figures are', async () => {
    await render(withCalendar(HANNAH, <CalendarScopeNote echoed={HANNAH} detail="The commission and tips of the person on this calendar." />));
    expect(screen.getByText('Showing Hannah only.')).toBeTruthy();
    expect(screen.getByText('Showing Hannah only. The commission and tips of the person on this calendar.')).toBeTruthy();
  });

  it('says the whole venue when the answer carries no calendar while one is chosen', async () => {
    await render(withCalendar(HANNAH, <CalendarScopeNote echoed={null} />));
    expect(screen.getByText('These figures are for the whole venue.')).toBeTruthy();
  });

  it('says nothing for all calendars, and nothing without the Reports screen around it', async () => {
    await render(withCalendar(null, <CalendarScopeNote echoed={undefined} />));
    expect(screen.queryByText(/whole venue|Showing/)).toBeNull();
    await render(
      <>
        <CalendarScopeNote echoed={undefined} />
        <WholeVenueNote />
      </>,
    );
    expect(screen.queryByText(/whole venue|Showing/)).toBeNull();
  });

  it('puts the whole-venue line on a report that never splits by calendar, only while one is chosen', async () => {
    await render(withCalendar(HANNAH, <WholeVenueNote />));
    expect(screen.getByText('These figures are for the whole venue.')).toBeTruthy();
    // A whole tab (Takings, Vouchers) and the data export, in the web's words.
    await render(withCalendar(HANNAH, <WholeVenueNote variant="tab" />));
    expect(screen.getByText('These figures are for the whole venue. Hannah stays chosen on the other tabs.')).toBeTruthy();
    await render(withCalendar(HANNAH, <WholeVenueNote variant="files" />));
    expect(screen.getByText('These files are for the whole venue, whichever calendar you chose above.')).toBeTruthy();
    await render(withCalendar(null, <WholeVenueNote variant="tab" />));
    expect(screen.queryByText(/whole venue/)).toBeNull();
  });

  it("shows the server's sentence and the way back to all calendars", async () => {
    const onClear = jest.fn();
    await render(withCalendar(HANNAH, <CalendarRefusal message="Filtering by calendar isn't ready yet for this report." />, onClear));
    expect(screen.getByText("Filtering by calendar isn't ready yet for this report.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Show all calendars'));
    });
    expect(onClear).toHaveBeenCalled();
  });

  it('hands every section the same calendar', async () => {
    function Reader({ label }: { label: string }) {
      const { calendar } = useReportCalendar();
      return <Text>{`${label}: ${calendar?.name ?? 'all'}`}</Text>;
    }
    await render(
      withCalendar(
        HANNAH,
        <>
          <Reader label="takings" />
          <Reader label="sales" />
        </>,
      ),
    );
    expect(screen.getByText('takings: Hannah')).toBeTruthy();
    expect(screen.getByText('sales: Hannah')).toBeTruthy();
  });
});

describe('a linked business and everyone together', () => {
  function withShowing(choice: ShowingChoice, children: ReactNode) {
    return (
      <ReportCalendarProvider showing={show(WITH_BUSINESSES, choice)} options={WITH_BUSINESSES} onClear={jest.fn()}>
        {children}
      </ReportCalendarProvider>
    );
  }
  const DETAIL = 'Bookings with a service on this calendar.';

  it('names a partner calendar with its business, from the answer', async () => {
    await render(
      withShowing(
        { kind: 'partner-calendar', venueId: 'v2', calendarId: 'p1' },
        <CalendarScopeNote
          echoed={{ id: 'p1', name: 'Jess' }}
          scope={{ kind: 'calendar', name: 'Jess', business: { venue_id: 'v2', name: 'Light 3', access: 'collective' } }}
          detail={DETAIL}
        />,
      ),
    );
    expect(screen.getByText(`Showing Jess at Light 3 only. ${DETAIL}`)).toBeTruthy();
  });

  it('says what a business shows, and that takings and sales are not shared', async () => {
    await render(
      withShowing(
        { kind: 'business', venueId: 'v2' },
        <CalendarScopeNote echoed={null} scope={{ kind: 'business', name: 'Light 3', business: { venue_id: 'v2', name: 'Light 3', access: 'collective' } }} detail={DETAIL} />,
      ),
    );
    expect(
      screen.getByText(
        'Showing Light 3. Bookings on the calendars Light 3 shares with you. Takings and sales are not shared between businesses.',
      ),
    ).toBeTruthy();
  });

  it('lists everyone together, yours first, from the answer or else the picker', async () => {
    const together = { kind: 'together' as const, name: 'Everyone together', business: null };
    await render(withShowing({ kind: 'together' }, <CalendarScopeNote echoed={null} scope={together} />));
    expect(
      screen.getByText(
        "Showing Everyone together: Plus 1, Light 3 and Aura. Each business's figures are added up, and each one is listed below. A client who visits two businesses counts once at each.",
      ),
    ).toBeTruthy();
    await render(withShowing({ kind: 'together' }, <CalendarScopeNote echoed={null} scope={together} togetherNames={['Plus 1', 'Light 3']} />));
    expect(screen.getByText(/^Showing Everyone together: Plus 1 and Light 3\./)).toBeTruthy();
  });

  it('reads an answer that applied nothing as the whole venue', async () => {
    await render(withShowing({ kind: 'business', venueId: 'v2' }, <CalendarScopeNote echoed={null} scope={null} />));
    expect(screen.getByText('These figures are for the whole venue.')).toBeTruthy();
  });

  it("never hands a till report a partner's calendar, and says the till figures are your venue's", async () => {
    function Reader() {
      const { calendar } = useReportCalendar();
      const scope = useReportScopeQuery();
      return <Text>{`till: ${calendar?.id ?? 'none'}; bookings: ${scope.calendarId ?? '-'} ${scope.business ?? '-'} ${scope.compare}`}</Text>;
    }
    await render(withShowing({ kind: 'partner-calendar', venueId: 'v2', calendarId: 'p1' }, <Reader />));
    expect(screen.getByText('till: none; bookings: p1 - previous')).toBeTruthy();
    await render(withShowing({ kind: 'together' }, <Reader />));
    expect(screen.getByText('till: none; bookings: - all previous')).toBeTruthy();
    await render(withShowing({ kind: 'business', venueId: 'v3' }, <Reader />));
    expect(screen.getByText('till: none; bookings: - v3 previous')).toBeTruthy();
    await render(withShowing({ kind: 'calendar', calendarId: 'c2' }, <Reader />));
    expect(screen.getByText('till: c2; bookings: c2 - previous')).toBeTruthy();

    const till =
      "These figures are your venue's only: takings and sales are never shared between businesses. Jess at Light 3 stays chosen on the other tabs.";
    await render(withShowing({ kind: 'partner-calendar', venueId: 'v2', calendarId: 'p1' }, <CalendarScopeNote echoed={null} till />));
    expect(screen.getByText(till)).toBeTruthy();
    await render(withShowing({ kind: 'partner-calendar', venueId: 'v2', calendarId: 'p1' }, <WholeVenueNote variant="tab" />));
    expect(screen.getByText(till)).toBeTruthy();
    await render(withShowing({ kind: 'together' }, <WholeVenueNote variant="tab" />));
    expect(screen.getByText(/Everyone together stays chosen on the other tabs\.$/)).toBeTruthy();
    await render(withShowing({ kind: 'business', venueId: 'v2' }, <WholeVenueNote />));
    expect(screen.getByText('These figures are for the whole venue.')).toBeTruthy();
    await render(withShowing({ kind: 'business', venueId: 'v2' }, <WholeVenueNote variant="files" />));
    expect(screen.getByText('These files are for the whole venue, whichever calendar you chose above.')).toBeTruthy();
  });

  it('offers the way back to your venue from a partner, in the web words', async () => {
    const clear = jest.fn();
    await render(
      <ReportCalendarProvider showing={show(WITH_BUSINESSES, { kind: 'business', venueId: 'v2' })} options={WITH_BUSINESSES} onClear={clear}>
        <CalendarRefusal message="Not ready yet." />
      </ReportCalendarProvider>,
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Show your venue'));
    });
    expect(clear).toHaveBeenCalled();
  });
});
