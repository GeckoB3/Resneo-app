/**
 * The Reports calendar filter's parts: the picker (All calendars plus each calendar, the one no
 * longer active labelled), what a section says about its figures, the whole-venue line, and the
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
  WholeVenueNote,
} from '@/components/reports/ReportCalendarFilter';

const OPTIONS = [
  { id: 'c1', name: 'Hannah', active: true },
  { id: 'c2', name: 'Jenny', active: true },
  { id: 'c3', name: 'Jo', active: false },
];
const HANNAH = { id: 'c1', name: 'Hannah' };

describe('ReportCalendarPicker', () => {
  it('reads "All calendars" until one is chosen, and lists each calendar in the server order', async () => {
    const onChange = jest.fn();
    await render(<ReportCalendarPicker options={OPTIONS} value={null} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Calendar, All calendars' })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByHintText('Opens the calendar choices'));
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
    expect(onChange).toHaveBeenCalledWith('c3');
    // Choosing closes the sheet.
    expect(screen.queryByTestId('calendar-sheet')).toBeNull();
  });

  it('is greyed out on a whole-venue tab, reading All calendars, and does not open', async () => {
    const onChange = jest.fn();
    await render(<ReportCalendarPicker options={OPTIONS} value="c1" onChange={onChange} disabled />);
    const line = screen.getByRole('button', { name: 'Calendar, All calendars' });
    expect(line).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
    await act(async () => {
      fireEvent.press(line);
    });
    expect(screen.queryByTestId('calendar-sheet')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('names the calendar chosen, and goes back to all calendars', async () => {
    const onChange = jest.fn();
    await render(<ReportCalendarPicker options={OPTIONS} value="c3" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Calendar, Jo (no longer active)' })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByHintText('Opens the calendar choices'));
    });
    expect(screen.getByRole('radio', { name: 'Jo (no longer active)' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'All calendars' }));
    });
    expect(onChange).toHaveBeenCalledWith(null);
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
