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

/** Swapped in per-test so the add-on paths can be exercised. Empty by default. */
let mockAddonGroups: unknown[] = [];

const ADDON_GROUP = {
  group: {
    id: 'grp-1',
    name: 'Finishing',
    prompt_to_client: null,
    description: null,
    selection_type: 'multi',
    min_select: 0,
    max_select: null,
    sort_order: 0,
  },
  addons: [
    {
      id: 'addon-gloss',
      name: 'Gloss',
      description: null,
      additional_price_pence: 500,
      additional_duration_minutes: 0,
      sort_order: 0,
    },
    {
      id: 'addon-treatment',
      name: 'Treatment',
      description: null,
      additional_price_pence: 800,
      additional_duration_minutes: 0,
      sort_order: 1,
    },
  ],
  link_sort_order: 0,
};

jest.mock('@/lib/queries/useAppointmentCatalog', () => ({
  useAppointmentCatalog: () => ({
    data: {
      practitioners: [
        {
          id: 'prac-1',
          name: 'Sam',
          services: [
            {
              id: 'svc-1',
              name: 'Cut & Finish',
              duration_minutes: 45,
              variants: [],
              addon_groups: mockAddonGroups,
            },
          ],
        },
      ],
    },
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

/** The add-ons the booking already has — what Undo has to put back. */
let mockDetailAddons: { addon_id: string }[] = [];
jest.mock('@/lib/queries/useBookingDetail', () => ({
  useBookingDetail: () => ({ data: { addons: mockDetailAddons } }),
}));

const mockModify = jest.fn();
const mockNotify = jest.fn();
// The dry-run pre-check gates Save (a pending check keeps it disabled), so the
// mock answers "available" straight away — the debounce is still a real timer.
const mockValidate = jest.fn(
  (_input: unknown, opts?: { onSuccess?: (r: { ok: boolean }) => void }) =>
    opts?.onSuccess?.({ ok: true }),
);
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useModifyAppointment: () => ({ mutateAsync: mockModify, isPending: false }),
  useValidateAppointmentModification: () => ({ mutate: mockValidate }),
  useNotifyBookingModification: () => ({ mutate: mockNotify }),
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

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
  mockModify.mockResolvedValue({});
  mockNotify.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  onClose.mockClear();
  mockAddonGroups = [];
  mockDetailAddons = [];
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

/** Nudge a Stepper through its a11y "adjustable" action (its real +/− path). */
async function step(label: string, direction: 'increment' | 'decrement') {
  await act(async () => {
    fireEvent(screen.getByLabelText(label), 'accessibilityAction', {
      nativeEvent: { actionName: direction },
    });
  });
}

function stepperValue(label: string): string | undefined {
  return screen.getByLabelText(label).props.accessibilityValue?.text;
}

/** Let the 450ms validation debounce fire so Save leaves its "checking" state. */
async function settleAvailability() {
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
}

/** Move the booking to 09:30 and save it — the flow that defers the email. */
async function moveAndSave() {
  await press('Change');
  await press('MONTH_CALENDAR');
  await press('09:30');
  await settleAvailability();
  await press('Save changes');
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

  it('keeps the add-ons the booking already had when saving an unrelated change', async () => {
    // Regression: both seeding effects run in the same commit, and the add-on
    // one reads the pre-seed closure (serviceId still null → "no groups"). It
    // used to latch `addonsSeeded` there, so a booking whose detail was already
    // cached never seeded its add-ons and the next save PATCHed `addons: []`,
    // wiping them. Changing only the duration must leave Gloss on the booking.
    mockAddonGroups = [ADDON_GROUP];
    mockDetailAddons = [{ addon_id: 'addon-gloss' }];
    jest.useFakeTimers();
    try {
      await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
      await press('1h');
      await settleAvailability();
      await press('Save changes');

      expect(mockModify).toHaveBeenCalledWith(
        expect.objectContaining({ addons: [{ addon_id: 'addon-gloss' }] }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  describe('a booking whose row carries no end time', () => {
    // Regression (R13-4): `bookings.booking_end_time` is NULL for every
    // guest-created appointment (only the resource flows post one), so the
    // detail resolves `durationMinutes: null`. This form used to seed 30
    // minutes there, and saving ANY change rewrote a 45-minute appointment to
    // half an hour, handing the practitioner's time back to availability.
    const NO_END: ModifyBookingTarget = { ...TARGET, durationMinutes: null };

    it('adopts the service catalogue duration instead of defaulting to 30', async () => {
      await render(<ModifyBookingSheet target={NO_END} onClose={onClose} />);
      expect(stepperValue('Duration')).toBe('45 min');
    });

    it('does not treat the adopted duration as a staff edit', async () => {
      // Adopting is not a change, so Save must stay disabled on a form nobody
      // has touched.
      await render(<ModifyBookingSheet target={NO_END} onClose={onClose} />);
      expect(screen.getByText('Adjust a field to check availability and enable save.')).toBeTruthy();

      await press('Save changes');
      expect(mockModify).not.toHaveBeenCalled();
    });

    it('saves the adopted duration, never 30', async () => {
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={NO_END} onClose={onClose} />);
        await moveAndSave();

        expect(mockModify).toHaveBeenCalledWith(
          expect.objectContaining({ booking_time: '09:30:00', duration_minutes: 45 }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('undo restores the adopted duration, not 30', async () => {
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={NO_END} onClose={onClose} />);
        await moveAndSave();
        await press('Undo change');

        expect(mockModify).toHaveBeenLastCalledWith(
          expect.objectContaining({ booking_time: '14:00:00', duration_minutes: 45 }),
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('by-hand start nudge', () => {
    it('steps in 5-minute marks, not 1', async () => {
      await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
      expect(stepperValue('Start')).toBe('14:00');

      await step('Start', 'increment');
      expect(stepperValue('Start')).toBe('14:05');

      await step('Start', 'decrement');
      await step('Start', 'decrement');
      expect(stepperValue('Start')).toBe('13:55');
    });

    it('is labelled "Start" — the "(by hand)" qualifier is gone', async () => {
      await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
      expect(screen.getByLabelText('Start')).toBeTruthy();
      expect(screen.queryByLabelText('Start (by hand)')).toBeNull();
      expect(screen.queryByText(/by hand/i)).toBeNull();
    });

    it('snaps an off-grid start onto the 5-minute grid', async () => {
      // A booking that starts at 14:02 (an overrun, or a slot on a 1-min
      // interval) must not carry that offset forward as 14:07.
      await render(
        <ModifyBookingSheet target={{ ...TARGET, time: '14:02:00' }} onClose={onClose} />,
      );
      await step('Start', 'increment');
      expect(stepperValue('Start')).toBe('14:05');

      await step('Start', 'decrement');
      await step('Start', 'decrement');
      expect(stepperValue('Start')).toBe('13:55');
    });
  });

  describe('guest notification after a start-time change', () => {
    it('holds the email back and offers notify / don’t notify / undo', async () => {
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await moveAndSave();

        // The PATCH must ask the server NOT to email on the spot.
        expect(mockModify).toHaveBeenCalledWith(
          expect.objectContaining({
            booking_time: '09:30:00',
            defer_modification_guest_notification: true,
          }),
        );
        // …and the sheet stays open on the prompt instead of dismissing.
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByText('Booking moved')).toBeTruthy();
        expect(screen.getByText('Notify Alex Rivera')).toBeTruthy();
        expect(screen.getByText("Don't notify")).toBeTruthy();
        expect(screen.getByText('Undo change')).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('shows the prompt content-sized, not as a 90%-tall sheet', async () => {
      // Three buttons in a `fill` sheet would be a screen of empty space; the
      // calendar's equivalent prompt is content-sized too.
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await moveAndSave();

        expect(screen.getByText('Booking moved')).toBeTruthy();
        expect(mockSheetProps[mockSheetProps.length - 1].fill).toBeFalsy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('sends the held-back email when the user taps Notify', async () => {
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await moveAndSave();
        await press('Notify Alex Rivera');

        expect(mockNotify).toHaveBeenCalledWith(
          { bookingId: 'bk-1' },
          expect.objectContaining({ onSuccess: expect.any(Function) }),
        );
        expect(onClose).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('closes silently on "Don\'t notify" — the guest is never emailed', async () => {
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await moveAndSave();
        await press("Don't notify");

        expect(mockNotify).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('undo sends no add-ons key for a service that has none', async () => {
      // An `addons` key is REPLACE semantics server-side, so sending one for a
      // service with no groups is at best noise. Omitting it leaves them alone.
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await moveAndSave();
        await press('Undo change');

        expect(mockModify).toHaveBeenLastCalledWith(
          expect.not.objectContaining({ addons: expect.anything() }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('undo restores the add-ons the booking started with', async () => {
      // The save invalidates the detail query, so by Undo time `currentAddons`
      // describes the NEW booking. Undo must use the snapshot taken on open, or
      // it quietly drops (or re-adds) add-ons while "restoring".
      mockAddonGroups = [ADDON_GROUP];
      mockDetailAddons = [{ addon_id: 'addon-gloss' }];
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        // Change the add-on selection too, so a naive undo would restore Treatment.
        await press('Treatment');
        await moveAndSave();
        await press('Undo change');

        expect(mockModify).toHaveBeenLastCalledWith(
          expect.objectContaining({ addons: [{ addon_id: 'addon-gloss' }] }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('undo puts the booking back on its original slot, without notifying', async () => {
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await moveAndSave();
        await press('Undo change');

        // Second PATCH restores every field the form can change, and stays quiet.
        expect(mockModify).toHaveBeenCalledTimes(2);
        expect(mockModify).toHaveBeenLastCalledWith(
          expect.objectContaining({
            booking_date: '2026-08-10',
            booking_time: '14:00:00',
            practitioner_id: 'prac-1',
            appointment_service_id: 'svc-1',
            duration_minutes: 45,
            service_variant_id: null,
            defer_modification_guest_notification: true,
          }),
        );
        expect(mockNotify).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not prompt when the start did not move', async () => {
      // Only the duration changed — the server sends no modification email for
      // that, so there is nothing to defer and nothing to ask about.
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await press('1h');
        await settleAvailability();
        await press('Save changes');

        expect(mockModify).toHaveBeenCalledWith(
          expect.not.objectContaining({ defer_modification_guest_notification: true }),
        );
        expect(screen.queryByText('Booking moved')).toBeNull();
        expect(onClose).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
