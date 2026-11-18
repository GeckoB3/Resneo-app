/**
 * Card on file on the staff lists (card-on-file-plan §6.1, §6.4): the list row pill (and an older
 * server's row), the bulk tray's card actions and "Select all {n}", the filter sheet's Card section,
 * the diary bar's Waiting for card pill or glyph with its spoken label, and the resource roster.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/haptics', () => ({ hapticSelect: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticTap: jest.fn() }));
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));
jest.mock('@/lib/queries/useContactsBulk', () => ({
  useBulkAddTag: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useAppointmentCatalog', () => ({
  useAppointmentCatalog: () => ({ data: undefined, isLoading: false }),
}));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

import { BookingBulkBar } from '@/components/bookings/BookingBulkBar';
import { BookingFilterSheet } from '@/components/bookings/BookingFilterSheet';
import { BookingRow } from '@/components/bookings/BookingRow';
import { AppointmentBlock } from '@/components/calendar/AppointmentBlock';
import { ResourceDaySection } from '@/components/resources/ResourceDaySection';
import { CARD_FILTER_OPTIONS } from '@/lib/booking/card-list';
import type { ResourceDayBookingRow, ResourceListItem } from '@/lib/queries/useResources';
import type { BookingListRow } from '@/types/booking-list';

function bk(overrides: Partial<BookingListRow> & { id: string }): BookingListRow {
  return {
    booking_date: '2026-11-17',
    booking_time: '09:00',
    party_size: 1,
    status: 'Booked',
    guest_name: 'Ada Lovelace',
    deposit_status: null,
    ...overrides,
  };
}

describe('BookingRow card pill', () => {
  it.each([
    ['waiting', 'Waiting for card'],
    ['protected', 'Protected'],
    ['not_needed', 'Card not needed'],
    ['charged', 'Fee charged'],
  ] as const)('shows %s as "%s" instead of the raw deposit status', async (state, label) => {
    await render(
      <BookingRow
        booking={bk({ id: 'a', deposit_status: 'Pending', deposit_amount_pence: 1000, card_state: state })}
        isAppointment
        onPress={() => {}}
      />,
    );
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText('Deposit due')).toBeNull();
    expect(screen.getByLabelText(new RegExp(`Ada Lovelace.*${label}`))).toBeTruthy();
  });

  it('reads an older server row (no card_state) by its deposit status', async () => {
    await render(<BookingRow booking={bk({ id: 'b', deposit_status: 'Card Held' })} isAppointment onPress={() => {}} />);
    expect(screen.getByText('Protected')).toBeTruthy();
    expect(screen.queryByText('Card Held')).toBeNull();
  });

  it('keeps the deposit words for a money deposit', async () => {
    await render(
      <BookingRow
        booking={bk({ id: 'c', deposit_status: 'Pending', deposit_amount_pence: 1500, card_state: null })}
        isAppointment
        onPress={() => {}}
      />,
    );
    expect(screen.getByText('Deposit due')).toBeTruthy();
  });
});

describe('bulk tray card actions', () => {
  function tray(cardActions: ComponentProps<typeof BookingBulkBar>['cardActions'], countOverride?: number) {
    return render(
      <BookingBulkBar
        selected={[bk({ id: 'a', card_state: 'waiting' })]}
        allSelected={false}
        onToggleSelectAll={jest.fn()}
        onClear={jest.fn()}
        onMessageSelected={jest.fn()}
        cardActions={cardActions}
        countOverride={countOverride}
      />,
    );
  }

  it('offers both actions with a Waiting for card row, and Select all over the filter', async () => {
    const onConfirm = jest.fn();
    const onSend = jest.fn();
    const onSelectAll = jest.fn();
    await tray({
      canConfirmWithoutCard: true,
      canSendCardRequests: true,
      onConfirmWithoutCard: onConfirm,
      onSendCardRequests: onSend,
      selectAll: { count: 86, onPress: onSelectAll },
    });
    await fireEvent.press(screen.getByText('Confirm without a card'));
    await fireEvent.press(screen.getByText('Send card requests'));
    await fireEvent.press(screen.getByText('Select all 86 bookings'));
    expect(onConfirm).toHaveBeenCalled();
    expect(onSend).toHaveBeenCalled();
    expect(onSelectAll).toHaveBeenCalled();
  });

  it('offers only Send card requests for Card not needed rows, and counts a whole filter', async () => {
    await tray(
      {
        canConfirmWithoutCard: false,
        canSendCardRequests: true,
        onConfirmWithoutCard: jest.fn(),
        onSendCardRequests: jest.fn(),
        selectAll: null,
      },
      12,
    );
    expect(screen.queryByText('Confirm without a card')).toBeNull();
    expect(screen.getByText('Send card requests')).toBeTruthy();
    expect(screen.getByText('12 selected')).toBeTruthy();
  });

  it('shows no card actions without them', async () => {
    await tray(undefined);
    expect(screen.queryByText('Send card requests')).toBeNull();
  });
});

describe('filter sheet Card section', () => {
  const base: ComponentProps<typeof BookingFilterSheet> = {
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
  };

  it('lists the four card states and picks one', async () => {
    const onChangeCard = jest.fn();
    await render(
      <BookingFilterSheet
        {...base}
        cardOptions={CARD_FILTER_OPTIONS.map((o) => ({ key: o.key, label: o.label, count: 2 }))}
        cardFilter={null}
        onChangeCard={onChangeCard}
      />,
    );
    expect(screen.getByText('Card')).toBeTruthy();
    await fireEvent.press(screen.getByText('Waiting for card'));
    expect(onChangeCard).toHaveBeenCalledWith('waiting');
  });

  it('is hidden when the server sends no card states', async () => {
    await render(<BookingFilterSheet {...base} cardOptions={[]} onChangeCard={jest.fn()} />);
    expect(screen.queryByText('Waiting for card')).toBeNull();
  });
});

describe('diary bar', () => {
  const bar = {
    id: 'bk-1',
    guestName: 'Ada Lovelace',
    serviceName: 'Cut & finish',
    timeLabel: '10:00–10:45',
    status: 'Booked',
    onPress: jest.fn(),
  };

  it('says Waiting for card in a pill on a tall bar, and to screen readers', async () => {
    await render(<AppointmentBlock {...bar} height={140} waitingForCard />);
    expect(screen.getByTestId('waiting-card-pill')).toBeTruthy();
    expect(screen.getByLabelText(/Ada Lovelace.*Waiting for card/)).toBeTruthy();
  });

  it('shows the card glyph alone on a short bar, still labelled', async () => {
    await render(<AppointmentBlock {...bar} height={28} waitingForCard />);
    expect(screen.queryByTestId('waiting-card-pill')).toBeNull();
    expect(screen.getByTestId('waiting-card-glyph').props.accessibilityLabel).toBe('Waiting for card');
    expect(screen.getByLabelText(/Ada Lovelace.*Waiting for card/)).toBeTruthy();
  });

  it('shows nothing extra for a booking that is not waiting', async () => {
    await render(<AppointmentBlock {...bar} height={140} />);
    expect(screen.queryByTestId('waiting-card-pill')).toBeNull();
    expect(screen.queryByTestId('waiting-card-glyph')).toBeNull();
    expect(screen.queryByLabelText(/Waiting for card/)).toBeNull();
  });
});

describe('resource roster', () => {
  it('labels each card-hold booking with its pill', async () => {
    const resource = { id: 'r1', name: 'Court 1', is_active: true, colour: null } as unknown as ResourceListItem;
    const bookings: ResourceDayBookingRow[] = [
      {
        id: 'b1',
        booking_date: '2026-11-17',
        booking_time: '09:00',
        booking_end_time: '10:00',
        status: 'Booked',
        guest_name: 'Ada',
        party_size: 1,
        deposit_status: 'Pending',
        card_state: 'waiting',
      },
      {
        id: 'b2',
        booking_date: '2026-11-17',
        booking_time: '11:00',
        booking_end_time: '12:00',
        status: 'Booked',
        guest_name: 'Grace',
        party_size: 1,
        deposit_status: 'Card Held',
      },
    ];
    await render(<ResourceDaySection resource={resource} bookings={bookings} onPressBooking={jest.fn()} />);
    expect(screen.getByText('Waiting for card')).toBeTruthy();
    expect(screen.getByText('Protected')).toBeTruthy();
    expect(screen.queryByText('Card held')).toBeNull();
    expect(screen.getByLabelText(/Ada, Booked, Waiting for card/)).toBeTruthy();
  });
});
