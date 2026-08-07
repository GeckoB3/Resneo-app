/**
 * ModifyBookingSheet — the appointment modify form behind booking detail's
 * "Modify" button, mirroring the web `StaffAppointmentModifyForm`.
 *
 * Pinned here are the three things that were wrong or missing against the web:
 *
 *  - the Sheet must be `fill` and its ScrollView must flex, or the pinned
 *    Save/Cancel row is pushed off the bottom and the form can't be finished;
 *  - Save stays disabled until a field actually changes (web: "Adjust a field to
 *    check availability and enable save"), so it can't PATCH a booking to
 *    exactly what it already is;
 *  - date and time are chosen from a month calendar and grouped slot list as
 *    STEPS in the same sheet — not a second modal (unreliable on iOS) and not a
 *    ±1-minute stepper, which is all the app had.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ModifyBookingSheet, type ModifyBookingTarget } from './ModifyBookingSheet';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

/**
 * Render Sheet children inline (avoids gesture-handler/Modal) AND record the
 * props, so the `fill` regression is asserted rather than eyeballed.
 */
const mockSheetProps: { fill?: boolean }[] = [];
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({
      visible,
      fill,
      children,
    }: {
      visible: boolean;
      fill?: boolean;
      children: React.ReactNode;
    }) => {
      mockSheetProps.push({ fill });
      return visible ? React.createElement(View, null, children) : null;
    },
  };
});

// The month calendar is exercised by its own suite; here it only has to prove
// the date STEP was reached and that availability is handed to it.
jest.mock('@/components/booking-wizard/MonthDatePicker', () => {
  const React = require('react');
  const { Text, Pressable } = require('react-native');
  return {
    MonthDatePicker: ({ onContinue }: { onContinue: () => void }) =>
      React.createElement(
        Pressable,
        { onPress: onContinue },
        React.createElement(Text, null, 'MONTH_CALENDAR'),
      ),
  };
});

const SERVICE = {
  id: 'svc-1',
  name: 'Cut & Finish',
  duration_minutes: 45,
  variants: [],
  addon_groups: [],
};

jest.mock('@/lib/queries/useAppointmentCatalog', () => ({
  useAppointmentCatalog: () => ({
    data: { practitioners: [{ id: 'prac-1', name: 'Sam', services: [SERVICE] }] },
    isLoading: false,
  }),
}));

let mockSlots: { practitioner_id: string; service_id: string; start_time: string }[] = [];
jest.mock('@/lib/queries/useAppointmentAvailability', () => ({
  useAppointmentAvailability: () => ({
    data: { practitioners: [{ id: 'prac-1', slots: mockSlots }] },
    isLoading: false,
  }),
}));

jest.mock('@/lib/queries/useMonthAvailability', () => ({
  useMonthAvailability: () => ({ data: { available_dates: ['2026-08-10'] }, isLoading: false }),
}));

jest.mock('@/lib/queries/useBookingDetail', () => ({
  useBookingDetail: () => ({ data: { addons: [] } }),
}));

const mockModify = jest.fn();
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useModifyAppointment: () => ({ mutateAsync: mockModify, isPending: false }),
  useValidateAppointmentModification: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: { id: 'venue-1', timezone: 'Europe/London' } }),
}));

const TARGET: ModifyBookingTarget = {
  id: 'bk-1',
  guestName: 'Alex Rivera',
  date: '2026-08-10',
  time: '14:00:00',
  durationMinutes: 45,
  practitionerId: 'prac-1',
  serviceId: 'svc-1',
  usesServiceItem: false,
  serviceVariantId: null,
};

const onClose = jest.fn();

beforeEach(() => {
  mockSheetProps.length = 0;
  mockModify.mockClear();
  onClose.mockClear();
  mockSlots = [
    { practitioner_id: 'prac-1', service_id: 'svc-1', start_time: '09:30' },
    { practitioner_id: 'prac-1', service_id: 'svc-1', start_time: '14:00' },
    { practitioner_id: 'prac-1', service_id: 'svc-1', start_time: '18:15' },
  ];
});

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

describe('ModifyBookingSheet', () => {
  it('fills the sheet so the action row cannot be pushed off screen', async () => {
    await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
    expect(mockSheetProps.every((p) => p.fill === true)).toBe(true);
    // The pinned actions are reachable in the same render as the scrolling form.
    expect(screen.getByText('Save changes')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('holds Save until a field changes, and says why', async () => {
    await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
    expect(screen.getByText('Adjust a field to check availability and enable save.')).toBeTruthy();

    await press('Save changes');
    expect(mockModify).not.toHaveBeenCalled();
  });

  it('enables Save once the duration moves, via the quick-duration presets', async () => {
    await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
    // Web parity: a "Quick durations" row alongside the numeric input. 45 → 60.
    await press('1h');

    expect(
      screen.queryByText('Adjust a field to check availability and enable save.'),
    ).toBeNull();
  });

  it('opens the month calendar as a step, not a second sheet', async () => {
    await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
    expect(screen.queryByText('MONTH_CALENDAR')).toBeNull();

    await press('Change');
    expect(screen.getByText('MONTH_CALENDAR')).toBeTruthy();
    // One Sheet on screen at a time — the step replaced the form, it didn't stack.
    expect(screen.queryByText('Save changes')).toBeNull();
  });

  it('groups free slots by period and marks the booking’s current time', async () => {
    await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
    await press('Change');
    await press('MONTH_CALENDAR'); // the mock calendar's Continue

    expect(screen.getByText('Morning')).toBeTruthy();
    expect(screen.getByText('Afternoon')).toBeTruthy();
    expect(screen.getByText('Evening')).toBeTruthy();
    // 14:00 is the booking's own slot, labelled so staff can find it again.
    expect(screen.getByText('14:00 · now')).toBeTruthy();
    expect(screen.getByText('09:30')).toBeTruthy();
  });

  it('returns to the form with the picked time applied', async () => {
    await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
    await press('Change');
    await press('MONTH_CALENDAR');
    await press('09:30');

    expect(screen.getByText('Save changes')).toBeTruthy();
    expect(screen.getByText(/09:30/)).toBeTruthy();
    expect(
      screen.queryByText('Adjust a field to check availability and enable save.'),
    ).toBeNull();
  });
});
