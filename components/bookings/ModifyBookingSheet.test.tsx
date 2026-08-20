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
/**
 * Variants on svc-1. Empty for every pre-existing case; the R21-5 suite sets two
 * with different lengths, which is the shape web's F7 bug needed to show itself.
 */
let mockServiceVariants: { id: string; name: string; duration_minutes: number }[] = [];

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
              variants: mockServiceVariants,
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

/**
 * Role + assigned calendars, which gate the reassign picker (R16-1). Admin by
 * default so every pre-existing case keeps the full calendar list; the tests
 * that care about the gate set this themselves.
 */
let mockStaffMe: { role: string; linked_calendar_ids: string[] } = {
  role: 'admin',
  linked_calendar_ids: [],
};
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: mockStaffMe } }),
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
/** The services endpoint — a different write: what the visit is MADE OF. */
const mockVisitServices = jest.fn();
jest.mock('@/lib/queries/useVisitMutations', () => ({
  useVisitSchedule: () => ({ mutateAsync: mockVisitSchedule, isPending: false }),
  useVisitServices: () => ({ mutateAsync: mockVisitServices, isPending: false }),
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

/**
 * What the schedule endpoint answers a dry run with. Its `services` carry the
 * ids the services endpoint needs, which is how the form learns what the visit
 * is made of — the rows it is handed have names, not ids.
 */
function visitPlan(over: { total_minutes?: number; changed?: boolean; services?: unknown[] } = {}) {
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
    services: [
      { id: 'bk-lead', service_id: 'svc-1', service_variant_id: null },
      { id: 'bk-1', service_id: 'svc-2', service_variant_id: null },
      { id: 'bk-3', service_id: 'svc-1', service_variant_id: null },
    ],
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
  mockVisitServices.mockClear();
  mockVisitServices.mockResolvedValue({ ok: true, total_minutes: 165, services: [] });
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
  mockServiceVariants = [];
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

/**
 * Press by accessibility label, by position. A visit can hold the same service
 * twice, so its rows are told apart by where they sit, not by what they say.
 */
async function pressLabel(label: string, index = 0) {
  await act(async () => {
    fireEvent.press(screen.getAllByLabelText(label)[index]!);
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

  it('does not re-assert a calendar nobody changed', async () => {
    /**
     * R16-1 — the sheet used to send `practitioner_id` on every save, unchanged
     * or not, and its PRESENCE is what arms the server's managed-calendar gate
     * (web's C8 fix). So a non-admin editing the TIME of a colleague's booking —
     * a thing the server allows — was refused with a permissions error. Both the
     * dry run and the PATCH must stay quiet about a calendar that has not moved.
     */
    jest.useFakeTimers();
    try {
      await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
      await press('1h');
      await settleAvailability();
      await press('Save changes');

      expect(mockModify.mock.calls[0]?.[0]).not.toHaveProperty('practitioner_id');
      expect(mockValidate.mock.calls[0]?.[0]).not.toHaveProperty('practitioner_id');
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
            defer_modification_guest_notification: true,
          }),
        );
        // R16-1 — the calendar is NOT re-asserted, because it did not change.
        // Its mere presence arms the server's managed-calendar gate, which would
        // 403 a non-admin moving the time of a colleague's visit. The endpoint
        // resolves the calendar from the visit's own rows when it is omitted
        // (`visits/[groupBookingId]/schedule/route.ts:191`), so this is the same
        // write with one fewer way to be refused.
        expect(visitWrite()).not.toHaveProperty('practitioner_id');
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

    /**
     * Changing WHAT a visit is made of. The request is declarative — a row left
     * out is cancelled — so the assertions here are mostly about what the app
     * must never send.
     */
    describe('its service list', () => {
      it('lists the services with a way to change or add one', async () => {
        jest.useFakeTimers();
        try {
          await renderVisit();
          expect(screen.getByText('Services in this visit')).toBeTruthy();
          // Three rows: svc-1, svc-2, svc-1 — a visit may hold one service twice.
          expect(screen.getAllByLabelText('Change Cut & Finish')).toHaveLength(2);
          expect(screen.getByLabelText('Change Blow Dry')).toBeTruthy();
          expect(screen.getByText('Add a service')).toBeTruthy();
        } finally {
          jest.useRealTimers();
        }
      });

      it('is withheld when a row did not resolve to a service', async () => {
        // The list is declarative, so a partial one would cancel the service it
        // could not name. Better to offer no editing than to drop a service.
        jest.useFakeTimers();
        try {
          mockVisitSchedule.mockResolvedValue(
            visitPlan({
              services: [
                { id: 'bk-lead', service_id: 'svc-1', service_variant_id: null },
                { id: 'bk-legacy', service_id: null, service_variant_id: null },
              ],
            }),
          );
          await renderVisit();
          expect(screen.queryByText('Services in this visit')).toBeNull();
          // The rest of the visit is still editable.
          expect(screen.getByLabelText('Visit length')).toBeTruthy();
        } finally {
          jest.useRealTimers();
        }
      });

      it('adds a service through the services endpoint, with the known ids', async () => {
        jest.useFakeTimers();
        try {
          await renderVisit();
          await press('Add a service');
          await press('Blow Dry');
          await settleAvailability();
          await press('Save whole visit');

          expect(mockVisitServices).toHaveBeenCalledWith(
            expect.objectContaining({
              services: [
                { booking_id: 'bk-lead', service_id: 'svc-1', service_variant_id: null },
                { booking_id: 'bk-1', service_id: 'svc-2', service_variant_id: null },
                { booking_id: 'bk-3', service_id: 'svc-1', service_variant_id: null },
                { service_id: 'svc-2', service_variant_id: null },
              ],
              known_booking_ids: ['bk-lead', 'bk-1', 'bk-3'],
            }),
          );
          // The schedule endpoint must not also run: two writes for one edit.
          expect(visitWrite()).toBeUndefined();
        } finally {
          jest.useRealTimers();
        }
      });

      it('swaps a service in place, keeping its row', async () => {
        // Keeping `booking_id` is what makes it a re-service rather than a
        // cancel-and-insert, which would lose the row's history and its price.
        jest.useFakeTimers();
        try {
          await renderVisit();
          await pressLabel('Change Cut & Finish');
          await press('Blow Dry');
          await settleAvailability();
          await press('Save whole visit');

          expect(mockVisitServices).toHaveBeenCalledWith(
            expect.objectContaining({
              services: expect.arrayContaining([
                { booking_id: 'bk-lead', service_id: 'svc-2', service_variant_id: null },
              ]),
            }),
          );
        } finally {
          jest.useRealTimers();
        }
      });

      it('removes a service by leaving it out of the list', async () => {
        jest.useFakeTimers();
        try {
          await renderVisit();
          await pressLabel('Remove Cut & Finish');
          await settleAvailability();
          await press('Save whole visit');

          const body = mockVisitServices.mock.calls.at(-1)![0] as {
            services: { booking_id?: string }[];
            known_booking_ids: string[];
          };
          expect(body.services.map((s) => s.booking_id)).toEqual(['bk-1', 'bk-3']);
          // Still every id the form saw, or the endpoint cannot tell a removal
          // from a visit that changed underneath it.
          expect(body.known_booking_ids).toEqual(['bk-lead', 'bk-1', 'bk-3']);
        } finally {
          jest.useRealTimers();
        }
      });

      it('never offers to remove the last service', async () => {
        // An empty visit is a cancellation, which has its own refund and
        // notification rules. The endpoint refuses it; the form does not ask.
        jest.useFakeTimers();
        try {
          mockVisitSchedule.mockResolvedValue(
            visitPlan({
              services: [{ id: 'bk-lead', service_id: 'svc-1', service_variant_id: null }],
            }),
          );
          await renderVisit();
          expect(screen.queryByLabelText('Remove Cut & Finish')).toBeNull();
        } finally {
          jest.useRealTimers();
        }
      });

      it('hands the length to the services while the list is in play', async () => {
        // Two controls over one number would let a staff member ask for a visit
        // shorter than the services they just chose.
        jest.useFakeTimers();
        try {
          await renderVisit();
          expect(screen.getByLabelText('Visit length')).toBeTruthy();
          await press('Add a service');
          await press('Blow Dry');
          await settleAvailability();

          expect(screen.queryByLabelText('Visit length')).toBeNull();
          expect(
            screen.getByText('Set by the services you picked. Save, then reopen to adjust it by hand.'),
          ).toBeTruthy();
          // The length the endpoint planned for the new list, not the old span.
          expect(screen.getByText('2h 45m')).toBeTruthy();
        } finally {
          jest.useRealTimers();
        }
      });

      it('checks a changed list against the services endpoint, not the schedule one', async () => {
        jest.useFakeTimers();
        try {
          await renderVisit();
          mockVisitSchedule.mockClear();
          await press('Add a service');
          await press('Blow Dry');
          await settleAvailability();

          expect(mockVisitServices).toHaveBeenCalledWith(
            expect.objectContaining({ dry_run: true }),
          );
          expect(mockVisitSchedule).not.toHaveBeenCalled();
        } finally {
          jest.useRealTimers();
        }
      });

      it('does not offer Undo after the services changed', async () => {
        // Undo restores a schedule, and there is no honest schedule-only undo
        // once the list has been rewritten: a removed service has been cancelled,
        // and re-adding it would insert a new row rather than bring that one back.
        jest.useFakeTimers();
        try {
          await renderVisit();
          await press('TIME_PICKER');
          await press('Add a service');
          await press('Blow Dry');
          await settleAvailability();
          await press('Save whole visit');

          expect(screen.getByText('Visit moved')).toBeTruthy();
          expect(screen.getByText('Notify Alex Rivera')).toBeTruthy();
          expect(screen.queryByText('Undo change')).toBeNull();
        } finally {
          jest.useRealTimers();
        }
      });

      it('still offers Undo when only the schedule changed', async () => {
        jest.useFakeTimers();
        try {
          await renderVisit();
          await press('TIME_PICKER');
          await settleAvailability();
          await press('Save whole visit');
          expect(screen.getByText('Undo change')).toBeTruthy();
        } finally {
          jest.useRealTimers();
        }
      });

      it('surfaces a stale-visit refusal instead of applying the list', async () => {
        jest.useFakeTimers();
        try {
          const { ApiError } = require('@/lib/api/client');
          await renderVisit();
          mockVisitServices.mockRejectedValue(
            new ApiError('This visit was changed somewhere else. Refresh and try again.', 412, {}),
          );
          await press('Add a service');
          await press('Blow Dry');
          await settleAvailability();

          expect(
            screen.getByText('This visit was changed somewhere else. Refresh and try again.'),
          ).toBeTruthy();
        } finally {
          jest.useRealTimers();
        }
      });
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

/**
 * R21-5 — the duration must follow a variant switch.
 *
 * Web carried this as F7 (`491832ca`): its form adopted a catalogue duration only
 * when the field was empty, and its variant `<select>` set the id alone. Switching
 * Basic (30 min) to Premium (60 min) therefore posted 30, and the booking was saved
 * as Premium, priced as Premium, and given half the time Premium needs. Web's §12.8
 * flagged this app as likely carrying the same bug because that half of the fix was
 * client-side.
 *
 * It does not: `selectVariant`/`selectService` move the id and the duration
 * together. But nothing proved it — every other service fixture in this file uses
 * `variants: []` — so these pin the behaviour rather than leaving it to structure.
 */
describe('ModifyBookingSheet — variant duration (R21-5)', () => {
  /** Two lengths, so a stale duration is visible rather than coincidentally right. */
  const VARIANTS = [
    { id: 'var-basic', name: 'Basic', duration_minutes: 30 },
    { id: 'var-premium', name: 'Premium', duration_minutes: 60 },
  ];

  /** The booking as opened: on Basic, 30 minutes, matching its variant. */
  const ON_BASIC: ModifyBookingTarget = {
    ...TARGET,
    durationMinutes: 30,
    serviceVariantId: 'var-basic',
  };

  beforeEach(() => {
    mockServiceVariants = VARIANTS;
  });

  it('moves the duration to the variant that was picked', async () => {
    await render(<ModifyBookingSheet target={ON_BASIC} onClose={onClose} />);
    expect(stepperValue('Duration')).toBe('30 min');

    await press('Premium (60m)');

    // The bug's signature is this staying at "30 min".
    expect(stepperValue('Duration')).toBe('1h');
  });

  it('sends the new variant length, not the one the form opened with', async () => {
    jest.useFakeTimers();
    try {
      await render(<ModifyBookingSheet target={ON_BASIC} onClose={onClose} />);
      await press('Premium (60m)');
      await settleAvailability();
      await press('Save changes');

      expect(mockModify).toHaveBeenCalledWith(
        expect.objectContaining({
          service_variant_id: 'var-premium',
          duration_minutes: 60,
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('checks availability against the new length before saving', async () => {
    // The dry run gates Save, so a stale duration here would pre-clear a slot the
    // booking no longer fits — the server then judges the real one and 409s.
    jest.useFakeTimers();
    try {
      await render(<ModifyBookingSheet target={ON_BASIC} onClose={onClose} />);
      await press('Premium (60m)');
      await settleAvailability();

      expect(mockValidate).toHaveBeenCalledWith(
        expect.objectContaining({ service_variant_id: 'var-premium', duration_minutes: 60 }),
        expect.anything(),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('switching back restores the original length', async () => {
    await render(<ModifyBookingSheet target={ON_BASIC} onClose={onClose} />);
    await press('Premium (60m)');
    await press('Basic (30m)');

    expect(stepperValue('Duration')).toBe('30 min');
  });

  it('keeps a booking length that differs from its own variant on open', async () => {
    // Booked long, or trimmed by staff earlier. Opening the form must not quietly
    // re-adopt the catalogue figure — that would arm Save on an untouched form and
    // reschedule the appointment nobody asked to change.
    await render(
      <ModifyBookingSheet target={{ ...ON_BASIC, durationMinutes: 40 }} onClose={onClose} />,
    );

    expect(stepperValue('Duration')).toBe('40 min');
    expect(screen.getByText('Adjust a field to check availability and enable save.')).toBeTruthy();
  });
});

/**
 * R21-3 — a booking whose service was archived must not lose its variant.
 *
 * `requiresVariant` is false for two unrelated reasons: the service has no options,
 * or the service is no longer in the catalogue so the form knows nothing about its
 * options. Both used to post `service_variant_id: null`, and since web `491832ca`
 * that nulls `service_variant_name_snapshot` too — so adjusting only the TIME of an
 * archived-service booking silently dropped the option, name and all.
 *
 * Web reached the same place from the other side: its save omits the key already,
 * but its dry run does not (see Docs/R21_WEB_HANDOVER.md W2).
 */
describe('ModifyBookingSheet — archived service keeps its variant (R21-3)', () => {
  /** The booked service is not in the catalogue; the booking still has an option. */
  const ARCHIVED: ModifyBookingTarget = {
    ...TARGET,
    serviceId: 'svc-archived',
    serviceVariantId: 'var-basic',
  };

  /** The single body the save actually posted. */
  function savedBody(): Record<string, unknown> {
    return mockModify.mock.calls[0]![0] as Record<string, unknown>;
  }

  it('says the service is gone but still lets the time be adjusted', async () => {
    await render(<ModifyBookingSheet target={ARCHIVED} onClose={onClose} />);
    expect(
      screen.getByText(
        "The booked service is no longer in the catalogue — pick a service below to change it, or just adjust the time and duration.",
      ),
    ).toBeTruthy();
  });

  it('omits service_variant_id entirely when the catalogue cannot confirm it', async () => {
    jest.useFakeTimers();
    try {
      await render(<ModifyBookingSheet target={ARCHIVED} onClose={onClose} />);
      // Changed by hand rather than by slot: the slot list is keyed on the service
      // id, so an archived service has none — which is precisely why the form tells
      // staff to adjust the time and duration instead.
      await press('1h');
      await settleAvailability();
      await press('Save changes');

      // Not `null` — that is the value the route acts on, and acting on it here
      // drops both the id and the name snapshot.
      expect('service_variant_id' in savedBody()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('still sends null for a service that really has no options', async () => {
    // The other half of the same condition, and the one that must keep working:
    // this is how switching to a plain service clears a stale variant, since the
    // route only touches the column when the key is present.
    jest.useFakeTimers();
    try {
      await render(<ModifyBookingSheet target={TARGET} onClose={onClose} />);
      await moveAndSave();

      expect(savedBody()).toEqual(expect.objectContaining({ service_variant_id: null }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('sends the variant when the catalogue does have it', async () => {
    jest.useFakeTimers();
    try {
      mockServiceVariants = [{ id: 'var-basic', name: 'Basic', duration_minutes: 30 }];
      await render(
        <ModifyBookingSheet
          target={{ ...TARGET, durationMinutes: 30, serviceVariantId: 'var-basic' }}
          onClose={onClose}
        />,
      );
      await moveAndSave();

      expect(savedBody()).toEqual(
        expect.objectContaining({ service_variant_id: 'var-basic' }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
