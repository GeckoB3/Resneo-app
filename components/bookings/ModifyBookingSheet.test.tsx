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

/**
 * The visit's start control is the OS time picker (a visit has no slot list to
 * pick from). Stand in for it with a button that moves the start to 09:30, which
 * is the same move `moveAndSave` makes on an ordinary booking.
 */
jest.mock('@/components/ui/TimePickerField', () => {
  const React = require('react');
  const { Text, Pressable } = require('react-native');
  return {
    TimePickerField: ({ onChange }: { onChange: (minutes: number) => void }) =>
      React.createElement(
        Pressable,
        { onPress: () => onChange(9 * 60 + 30) },
        React.createElement(Text, null, 'TIME_PICKER'),
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

/** Catalogue processing pattern for svc-1. Empty unless a test sets it. */
let mockServiceProcessingBlocks: unknown[] = [];
/** A second service, so a test can switch away and swap patterns. */
let mockOtherServiceProcessingBlocks: unknown[] = [];

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
              processing_time_blocks: mockServiceProcessingBlocks,
            },
            {
              id: 'svc-2',
              name: 'Blow Dry',
              duration_minutes: 45,
              variants: [],
              addon_groups: [],
              processing_time_blocks: mockOtherServiceProcessingBlocks,
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
/**
 * The booking's own processing snapshot. `undefined` is the "column not loaded"
 * case, which must never be sent as `[]` (that would clear a real gap).
 */
let mockDetailProcessingBlocks: unknown;
jest.mock('@/lib/queries/useBookingDetail', () => ({
  useBookingDetail: () => ({
    data: { addons: mockDetailAddons, processing_time_blocks: mockDetailProcessingBlocks },
  }),
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

/**
 * The visit endpoint. Every call — the opening plan, each live check, the save
 * and the undo — goes through this one mutation, so the assertions below read
 * its calls to prove the form never PATCHes a single service of a visit.
 */
const mockVisitSchedule = jest.fn();
jest.mock('@/lib/queries/useVisitMutations', () => ({
  useVisitSchedule: () => ({ mutateAsync: mockVisitSchedule, isPending: false }),
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

/**
 * The same booking, as one service of a three-service visit. 14:00 to 16:15 with
 * a 15-minute hole in it: the rows span 135 minutes, the visit is really 120.
 */
const VISIT_TARGET: ModifyBookingTarget = {
  ...TARGET,
  durationMinutes: 135,
  visit: {
    groupBookingId: 'grp-1',
    startHm: '14:00',
    endHm: '16:15',
    serviceCount: 3,
    serviceNames: ['Cut & Blow Dry', 'Olaplex Treatment', 'Toner'],
    leadBookingId: 'bk-lead',
  },
};

/** What the visit endpoint answers a dry run with. */
function visitPlan(over: { total_minutes?: number; changed?: boolean } = {}) {
  return {
    ok: true,
    group_booking_id: 'grp-1',
    booking_date: '2026-08-10',
    start_time: '14:00',
    end_time: '16:15',
    total_minutes: 135,
    calendar_id: 'prac-1',
    changed: false,
    dry_run: true,
    services: [{ id: 'bk-lead' }, { id: 'bk-1' }, { id: 'bk-3' }],
    ...over,
  };
}

const onClose = jest.fn();

beforeEach(() => {
  mockSheetProps.length = 0;
  mockModify.mockClear();
  mockModify.mockResolvedValue({});
  mockVisitSchedule.mockClear();
  mockVisitSchedule.mockResolvedValue(visitPlan());
  // Cleared per test, or a visit's "never asks the single-booking validator"
  // assertion reads calls left behind by whatever ran before it.
  mockValidate.mockClear();
  mockNotify.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  onClose.mockClear();
  mockAddonGroups = [];
  mockDetailAddons = [];
  mockDetailProcessingBlocks = undefined;
  mockServiceProcessingBlocks = [];
  mockOtherServiceProcessingBlocks = [];
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

/** Every body the visit endpoint was asked with, oldest first. */
function visitBodies(): Record<string, unknown>[] {
  return mockVisitSchedule.mock.calls.map((c) => c[0] as Record<string, unknown>);
}

/** The one call that actually WRITES: a dry run plans, it does not save. */
function visitWrite(): Record<string, unknown> | undefined {
  return visitBodies().find((b) => b.dry_run !== true);
}

/** Render a visit and let its opening plan plus the first live check settle. */
async function renderVisit(target: ModifyBookingTarget = VISIT_TARGET) {
  await render(<ModifyBookingSheet target={target} onClose={onClose} />);
  await settleAvailability();
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

  describe('processing time', () => {
    // R14-2: a booking snapshots its service's processing gaps, and the server
    // validates that snapshot against whatever duration the PATCH asks for. The
    // sheet sent nothing, so shortening a booking below its last gap's end was
    // rejected ("Processing blocks must lie within the service duration") with
    // no way to resolve it from the app.
    const GAP = { id: 'blk-1', start_minute: 15, duration_minutes: 30 };

    it('sends the gaps fitted to the new duration', async () => {
      mockDetailProcessingBlocks = [GAP];
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        // 45 → 30: the 15-45 gap no longer fits and is trimmed to end with it.
        await press('30 min');
        await settleAvailability();
        await press('Save changes');

        expect(mockModify).toHaveBeenCalledWith(
          expect.objectContaining({
            duration_minutes: 30,
            processing_time_blocks: [{ id: 'blk-1', start_minute: 15, duration_minutes: 15 }],
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('drops a gap with no room left rather than sending an unfittable one', async () => {
      mockDetailProcessingBlocks = [GAP];
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await press('15 min');
        await settleAvailability();
        await press('Save changes');

        expect(mockModify).toHaveBeenCalledWith(
          expect.objectContaining({ duration_minutes: 15, processing_time_blocks: [] }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('sends the same fitted gaps to the dry-run validator', async () => {
      // Or the pre-check passes on the stored snapshot and Save then fails.
      mockDetailProcessingBlocks = [GAP];
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await press('30 min');
        await settleAvailability();

        expect(mockValidate).toHaveBeenLastCalledWith(
          expect.objectContaining({
            duration_minutes: 30,
            processing_time_blocks: [{ id: 'blk-1', start_minute: 15, duration_minutes: 15 }],
          }),
          expect.anything(),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('inherits the service pattern when the booking has no snapshot', async () => {
      // A NULL snapshot means "this booking follows its service's pattern", not
      // "it has no gaps". Parsing null to [] and sending that stripped the
      // service's processing time from the booking on its first save.
      mockDetailProcessingBlocks = null;
      mockServiceProcessingBlocks = [GAP];
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await press('30 min');
        await settleAvailability();
        await press('Save changes');

        expect(mockModify).toHaveBeenCalledWith(
          expect.objectContaining({
            processing_time_blocks: [{ id: 'blk-1', start_minute: 15, duration_minutes: 15 }],
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('sends [] for a booking that genuinely has no gaps', async () => {
      // The other side of the same coin: an EMPTY array is a real answer and
      // must not be confused with the null "inherit" case.
      mockDetailProcessingBlocks = [];
      mockServiceProcessingBlocks = [GAP];
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await press('30 min');
        await settleAvailability();
        await press('Save changes');

        expect(mockModify).toHaveBeenCalledWith(
          expect.objectContaining({ processing_time_blocks: [] }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('drops a malformed catalogue block instead of forwarding it', async () => {
      // The catalogue arrives as raw JSON like the booking's own column; passing
      // a bad entry through turns a clean save into a schema rejection.
      mockDetailProcessingBlocks = [GAP];
      mockOtherServiceProcessingBlocks = [
        { start_minute: 'nope', duration_minutes: 10 },
        { start_minute: 5, duration_minutes: 10 },
      ];
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await press('Blow Dry');
        await settleAvailability();
        await press('Save changes');

        expect(mockModify).toHaveBeenCalledWith(
          expect.objectContaining({
            processing_time_blocks: [{ start_minute: 5, duration_minutes: 10 }],
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('omits the key entirely when the booking’s own blocks never loaded', async () => {
      // `undefined` is "not loaded", NOT "has none". Sending [] would clear a
      // real processing gap on a booking the app never read.
      mockDetailProcessingBlocks = undefined;
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await press('30 min');
        await settleAvailability();
        await press('Save changes');

        expect(mockModify).toHaveBeenCalledWith(
          expect.not.objectContaining({ processing_time_blocks: expect.anything() }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('swaps in the new service’s pattern when the service changes', async () => {
      mockDetailProcessingBlocks = [GAP];
      mockOtherServiceProcessingBlocks = [{ start_minute: 5, duration_minutes: 10 }];
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await press('Blow Dry');
        await settleAvailability();
        await press('Save changes');

        // The old service's gap does not follow the booking across the switch.
        expect(mockModify).toHaveBeenCalledWith(
          expect.objectContaining({
            processing_time_blocks: [{ start_minute: 5, duration_minutes: 10 }],
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('says what saving will do to the gap, and stays quiet when nothing changes', async () => {
      mockDetailProcessingBlocks = [GAP];
      await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
      // Untouched at 45 minutes the gap fits, so there is nothing to warn about.
      expect(screen.getByText('Processing time')).toBeTruthy();
      expect(
        screen.queryByText(
          'Saving will shorten the processing gap so it ends with the appointment.',
        ),
      ).toBeNull();

      await press('30 min');
      expect(
        screen.getByText('Saving will shorten the processing gap so it ends with the appointment.'),
      ).toBeTruthy();
    });

    it('shows no processing panel on an ordinary booking', async () => {
      mockDetailProcessingBlocks = [];
      await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
      expect(screen.queryByText('Processing time')).toBeNull();
    });

    it('undo restores the booking’s own snapshot, not what the save fitted', async () => {
      mockDetailProcessingBlocks = [GAP];
      jest.useFakeTimers();
      try {
        await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
        await press('30 min');
        await moveAndSave();
        await press('Undo change');

        expect(mockModify).toHaveBeenLastCalledWith(
          expect.objectContaining({ processing_time_blocks: [GAP] }),
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
        // SKIP, not defer: no prompt follows an undo, so the flag that promises
        // one would be a lie to the next reader (R14-4).
        expect(mockModify).toHaveBeenCalledTimes(2);
        expect(mockModify).toHaveBeenLastCalledWith(
          expect.objectContaining({
            booking_date: '2026-08-10',
            booking_time: '14:00:00',
            practitioner_id: 'prac-1',
            appointment_service_id: 'svc-1',
            duration_minutes: 45,
            service_variant_id: null,
            skip_booking_modification_guest_notification: true,
          }),
        );
        expect(mockModify).toHaveBeenLastCalledWith(
          expect.not.objectContaining({ defer_modification_guest_notification: true }),
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

  /**
   * A multi-service visit is N booking rows. Editing the row the calendar opened
   * is what tore visits apart: shortening it left the services after it where
   * they were (dead time opens up), and moving it took the visit's head away from
   * its tail. Every assertion here is a guard against that returning.
   */
  describe('a multi-service visit', () => {
    it('says it is editing the visit, and lists what is in it', async () => {
      jest.useFakeTimers();
      try {
        await renderVisit();
        expect(screen.getByText('Modify visit')).toBeTruthy();
        expect(
          screen.getByText('3 services, edited as one booking: Cut & Blow Dry, Olaplex Treatment, Toner.'),
        ).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('withdraws per-service editing — one length, for the whole visit', async () => {
      jest.useFakeTimers();
      try {
        mockAddonGroups = [ADDON_GROUP];
        await renderVisit();
        // Changing one service's length is the edit that opened the hole.
        expect(screen.queryByText('Service')).toBeNull();
        expect(screen.queryByText('Variant')).toBeNull();
        expect(screen.queryByText('Add-ons')).toBeNull();
        // What it offers instead: the visit's own wall-clock span.
        expect(screen.getByLabelText('Visit length')).toBeTruthy();
        expect(screen.queryByLabelText('Duration')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('checks the whole visit against the endpoint, never one service', async () => {
      jest.useFakeTimers();
      try {
        await renderVisit();
        await press('TIME_PICKER');
        await settleAvailability();

        expect(mockValidate).not.toHaveBeenCalled();
        expect(visitBodies()).toContainEqual(
          expect.objectContaining({ dry_run: true, booking_time: '09:30:00' }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('saves through the visit endpoint, not a single booking PATCH', async () => {
      jest.useFakeTimers();
      try {
        await renderVisit();
        await press('TIME_PICKER');
        await settleAvailability();
        await press('Save whole visit');

        // The one that would have torn the visit.
        expect(mockModify).not.toHaveBeenCalled();
        expect(visitWrite()).toEqual(
          expect.objectContaining({
            booking_date: '2026-08-10',
            booking_time: '09:30:00',
            practitioner_id: 'prac-1',
            defer_modification_guest_notification: true,
          }),
        );
        expect(screen.getByText('Visit moved')).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not re-assert a length nobody edited', async () => {
      // `total_duration_minutes` is an instruction, not a description: the server
      // lays the services out to FILL it. Sending back the span the form happens
      // to be holding would put any dead time in it onto the tail service, so a
      // move would silently lengthen the last service.
      jest.useFakeTimers();
      try {
        await renderVisit();
        await press('TIME_PICKER');
        await settleAvailability();
        await press('Save whole visit');

        expect(visitWrite()).toEqual(
          expect.not.objectContaining({ total_duration_minutes: expect.anything() }),
        );
        // Nor on the check, or the two would be judging different requests.
        expect(visitBodies().every((b) => b.total_duration_minutes === undefined)).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('sends the length once it IS edited, as the whole visit’s span', async () => {
      jest.useFakeTimers();
      try {
        await renderVisit();
        await press('2h');
        await settleAvailability();
        await press('Save whole visit');

        expect(visitWrite()).toEqual(
          expect.objectContaining({ total_duration_minutes: 120 }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('notifies the guest against the visit’s FIRST service', async () => {
      // The endpoint sends one email for the visit, against its first service.
      // Posting to the opened row would either send nothing or tell the guest
      // about one service of the several that moved.
      jest.useFakeTimers();
      try {
        await renderVisit();
        await press('TIME_PICKER');
        await settleAvailability();
        await press('Save whole visit');
        await press('Notify Alex Rivera');

        expect(mockNotify).toHaveBeenCalledWith(
          { bookingId: 'bk-lead' },
          expect.anything(),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('undoes through the visit endpoint, all or nothing, without emailing', async () => {
      jest.useFakeTimers();
      try {
        await renderVisit();
        await press('TIME_PICKER');
        await settleAvailability();
        await press('Save whole visit');
        mockVisitSchedule.mockClear();
        await press('Undo change');

        expect(mockModify).not.toHaveBeenCalled();
        expect(visitWrite()).toEqual(
          expect.objectContaining({
            booking_date: '2026-08-10',
            booking_time: '14:00:00',
            skip_booking_modification_guest_notification: true,
          }),
        );
        // The move never touched the lengths, so the services keep the ones they
        // still have — which restores them exactly.
        expect(visitWrite()).toEqual(
          expect.not.objectContaining({ total_duration_minutes: expect.anything() }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('undo puts back the length the save changed', async () => {
      jest.useFakeTimers();
      try {
        await renderVisit();
        await press('TIME_PICKER');
        await press('2h');
        await settleAvailability();
        await press('Save whole visit');
        mockVisitSchedule.mockClear();
        await press('Undo change');

        expect(visitWrite()).toEqual(
          expect.objectContaining({
            booking_time: '14:00:00',
            total_duration_minutes: 135,
            skip_booking_modification_guest_notification: true,
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('adopts the length the endpoint plans, and offers to close a hole', async () => {
      // The rows span 135 minutes; the visit is really 120 with 15 minutes of
      // dead time an earlier per-service edit left in it. Saving closes it, so
      // Save is armed with nothing touched — and says why first.
      jest.useFakeTimers();
      try {
        mockVisitSchedule.mockResolvedValue(visitPlan({ total_minutes: 120, changed: true }));
        await renderVisit();

        expect(stepperValue('Visit length')).toBe('2h');
        expect(
          screen.getByText(
            'This visit has 15 minutes of dead time in it. Saving closes it, so the services run back to back.',
          ),
        ).toBeTruthy();
        expect(screen.queryByText('Adjust a field to check availability and enable save.')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not read the endpoint’s own correction as a staff edit', async () => {
      // A visit with no hole comes back unchanged: nothing to save, nothing to say.
      jest.useFakeTimers();
      try {
        await renderVisit();
        expect(screen.getByText('Adjust a field to check availability and enable save.')).toBeTruthy();
        expect(screen.queryByText(/dead time/)).toBeNull();
        await press('Save whole visit');
        expect(visitWrite()).toBeUndefined();
      } finally {
        jest.useRealTimers();
      }
    });

    it('floors the length at the services’ own floors, not one service’s', async () => {
      // Three services at 5 minutes each. Below the server's floor deliberately:
      // it adds the configured gaps, and a client clamp above it would put a
      // legitimate length out of reach.
      jest.useFakeTimers();
      try {
        await renderVisit();
        for (let i = 0; i < 40; i += 1) await step('Visit length', 'decrement');
        expect(stepperValue('Visit length')).toBe('15 min');
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not add the add-on minutes on top of a span that already holds them', async () => {
      // A visit's span already contains its services' add-on time. Seeding the
      // lead row's add-ons and folding their minutes in again would lengthen the
      // visit by them on every save.
      jest.useFakeTimers();
      try {
        mockAddonGroups = [
          {
            ...ADDON_GROUP,
            addons: [{ ...ADDON_GROUP.addons[0], additional_duration_minutes: 20 }],
          },
        ];
        mockDetailAddons = [{ addon_id: 'addon-gloss' }];
        await renderVisit();
        await press('2h');
        await settleAvailability();
        await press('Save whole visit');

        // 120, not 140.
        expect(visitWrite()).toEqual(
          expect.objectContaining({ total_duration_minutes: 120 }),
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
