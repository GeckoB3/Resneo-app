/**
 * The "Booked through" section of the bookings filter sheet: web parity with
 * AppointmentBookingsDashboard's collective select (Any page / each collective
 * / Not through a collective), hidden when no loaded booking came through a
 * collective.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { BookingFilterSheet } from './BookingFilterSheet';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

jest.mock('@/lib/queries/useAppointmentCatalog', () => ({
  useAppointmentCatalog: () => ({ data: undefined, isLoading: false }),
}));

function props(
  overrides: Partial<ComponentProps<typeof BookingFilterSheet>> = {},
): ComponentProps<typeof BookingFilterSheet> {
  return {
    visible: true,
    onClose: jest.fn(),
    linkedVenues: [],
    venueOwnSelected: true,
    selectedLinkedVenueIds: new Set(),
    onSelectAllVenues: jest.fn(),
    onToggleOwnVenue: jest.fn(),
    onToggleLinkedVenue: jest.fn(),
    statusOptions: [{ key: 'All', label: 'All' }],
    status: 'All',
    onChangeStatus: jest.fn(),
    practitioners: [],
    practitionerFilter: null,
    onChangePractitioner: jest.fn(),
    typeOptions: [],
    typeFilter: null,
    onChangeType: jest.fn(),
    showTimeOfDay: false,
    timeWindows: [],
    dayHourRange: null,
    onChangeDayHourRange: jest.fn(),
    showService: false,
    venueId: 'venue-1',
    serviceFilter: null,
    onChangeService: jest.fn(),
    showCompliance: false,
    complianceNeedsCount: 0,
    needsComplianceOnly: false,
    onToggleCompliance: jest.fn(),
    anyFilterActive: false,
    onReset: jest.fn(),
    ...overrides,
  };
}

describe('BookingFilterSheet: Booked through', () => {
  it('is hidden when no booking came through a collective', async () => {
    await render(<BookingFilterSheet {...props({ collectiveChoices: [], onChangeCollective: jest.fn() })} />);
    expect(screen.queryByText('Booked through')).toBeNull();
    expect(screen.queryByText('Any page')).toBeNull();
  });

  it('lists Any page, each collective and Not through a collective', async () => {
    await render(
      <BookingFilterSheet
        {...props({
          collectiveChoices: [
            { id: 'col-a', name: 'Aura Hair' },
            { id: 'col-b', name: 'Studio Row' },
          ],
          collectiveFilter: 'all',
          onChangeCollective: jest.fn(),
        })}
      />,
    );
    expect(screen.getByText('Booked through')).toBeTruthy();
    expect(screen.getByText('Any page')).toBeTruthy();
    expect(screen.getByText('Aura Hair')).toBeTruthy();
    expect(screen.getByText('Studio Row')).toBeTruthy();
    expect(screen.getByText('Not through a collective')).toBeTruthy();
  });

  it('picks a collective, and tapping it again goes back to any page', async () => {
    const onChangeCollective = jest.fn();
    const choices = [{ id: 'col-a', name: 'Aura Hair' }];
    const { rerender } = await render(
      <BookingFilterSheet
        {...props({ collectiveChoices: choices, collectiveFilter: 'all', onChangeCollective })}
      />,
    );
    await fireEvent.press(screen.getByText('Aura Hair'));
    expect(onChangeCollective).toHaveBeenLastCalledWith('col-a');

    await rerender(
      <BookingFilterSheet
        {...props({ collectiveChoices: choices, collectiveFilter: 'col-a', onChangeCollective })}
      />,
    );
    await fireEvent.press(screen.getByText('Aura Hair'));
    expect(onChangeCollective).toHaveBeenLastCalledWith('all');

    await fireEvent.press(screen.getByText('Not through a collective'));
    expect(onChangeCollective).toHaveBeenLastCalledWith('none');

    await fireEvent.press(screen.getByText('Any page'));
    expect(onChangeCollective).toHaveBeenLastCalledWith('all');
  });
});
