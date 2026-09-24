/**
 * Event editor copy (web parity 2026-09-23, `EventManagerView`).
 *
 * E-1: changing an existing event's date or times moves its bookings and tells
 * those guests, so edit mode says so under the pickers.
 * E-10: the switch hides the event from guests without cancelling it, so it is
 * "Show on booking page", with a line saying bookings stay and nobody is told.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { ManagedEvent } from '@/types/events-manage';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
// Render the sheet's children inline (avoids gesture-handler and the modal).
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
// The OS pickers have their own suites.
jest.mock('@/components/ui/DatePickerField', () => ({ DatePickerField: () => null }));
jest.mock('@/components/ui/TimePickerField', () => ({ TimePickerField: () => null }));

const mockMutation = { mutateAsync: jest.fn(), isPending: false };
jest.mock('@/lib/queries/useEventsManage', () => ({
  useCreateEvent: () => mockMutation,
  useUpdateEvent: () => mockMutation,
}));
jest.mock('@/lib/queries/usePractitioners', () => ({
  usePractitioners: () => ({ data: { practitioners: [] } }),
  useCreateHostCalendar: () => mockMutation,
}));
jest.mock('@/lib/queries/useSetupStatus', () => ({
  useSetupStatus: () => ({ data: { stripe_connected: true } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: { timezone: 'Europe/London', current_user_role: 'admin' } }),
}));

import { EventEditorSheet } from '@/components/events/EventEditorSheet';

const MOVE_NOTE =
  "Changing the date or times moves this event's bookings, and those guests are sent the new details.";
const HIDE_HELPER =
  'Turn this off to hide this event from guests. Bookings it already has stay as they are, and nobody is contacted.';

const event: ManagedEvent = {
  id: 'ev-1',
  name: 'Wine tasting',
  description: null,
  event_date: '2030-01-05',
  start_time: '18:00:00',
  end_time: '20:00:00',
  capacity: 20,
  image_url: null,
  is_active: false,
  calendar_id: null,
  payment_requirement: 'none',
  deposit_amount_pence: null,
  ticket_types: [{ id: 't-1', name: 'Standard', price_pence: 1500, capacity: null, sort_order: 0 }],
};

describe('EventEditorSheet copy', () => {
  it('says a date or time change moves the bookings, in edit mode only (E-1)', async () => {
    await render(<EventEditorSheet target={{ mode: 'edit', event }} onClose={jest.fn()} />);
    expect(screen.getByText(MOVE_NOTE)).toBeTruthy();

    await render(<EventEditorSheet target={{ mode: 'create' }} onClose={jest.fn()} />);
    expect(screen.queryByText(MOVE_NOTE)).toBeNull();
  });

  it('calls the switch "Show on booking page" and says hiding contacts nobody (E-10)', async () => {
    await render(<EventEditorSheet target={{ mode: 'edit', event }} onClose={jest.fn()} />);
    expect(screen.getByText('Show on booking page')).toBeTruthy();
    expect(screen.getByText(HIDE_HELPER)).toBeTruthy();
    expect(screen.queryByText('Active (bookable by guests)')).toBeNull();
    // A hidden event opens with the switch off.
    expect(screen.getByLabelText('Show on booking page').props.value).toBe(false);
  });
});

describe('EventEditorSheet ticket rows', () => {
  beforeEach(() => {
    mockMutation.mutateAsync.mockReset();
    mockMutation.mutateAsync.mockResolvedValue({ created: 1 });
  });

  it('leaves a blank ticket capacity out of a new event, which the server refuses as null', async () => {
    await render(<EventEditorSheet target={{ mode: 'create' }} onClose={jest.fn()} />);
    // The Name field's label is a separate Text; it is the empty input capped at 200.
    const nameField = screen.getAllByDisplayValue('').find((input) => input.props.maxLength === 200);
    await fireEvent.changeText(nameField!, 'Open night');
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. General admission'), 'Entry');
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });
    const sent = mockMutation.mutateAsync.mock.calls[0]![0];
    expect(sent.ticket_types).toEqual([{ name: 'Entry', price_pence: 0, sort_order: 0 }]);
    expect(sent.ticket_types[0]).not.toHaveProperty('capacity');
  });

  it("sends a saved tier's id on an edit, so it is updated in place", async () => {
    await render(<EventEditorSheet target={{ mode: 'edit', event }} onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });
    const sent = mockMutation.mutateAsync.mock.calls[0]![0];
    expect(sent.id).toBe('ev-1');
    expect(sent.ticket_types).toEqual([{ id: 't-1', name: 'Standard', price_pence: 1500, sort_order: 0 }]);
  });
});
