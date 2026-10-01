/**
 * BookableCalendarsManager — reorder / slug-copy / DELETE (Availability Critical).
 *
 * Renders the manager with mocked query + mutation hooks and exercises:
 *  - up/down reorder → PATCH `sort_order` (dense 0..n-1)
 *  - booking-link slug Save + Copy → PATCH `slug` + clipboard write of the public URL
 *  - delete → remove sheet → `useDeletePractitioner`; a calendar with upcoming
 *    bookings shows the list instead, from the pre-check or the server's 409
 *  - pausing asks who is still booked first and warns before it saves (R44-4)
 *  - the plan calendar-limit 403 surfaces as an upgrade notice (not a raw toast)
 *
 * jest hoists mock factories above imports, so every variable a factory closes
 * over is prefixed `mock*` (the only out-of-scope names jest permits).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';

import { BookableCalendarsManager, calendarSetupList } from '@/components/availability/BookableCalendarsManager';

// expo-symbols renders the IconButton glyphs — stub to a host element.
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Render Sheet children inline (avoids gesture-handler/Modal) when visible.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockClipboard = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock('expo-clipboard', () => ({ setStringAsync: (...a: unknown[]) => mockClipboard(...a) }));

jest.mock('@/lib/env', () => ({
  getWebUrl: () => 'https://app.resneo.com',
  isBackendConfigured: () => true,
}));

// Venue context — admin with a slug so booking links + reorder are enabled.
let mockVenue: Record<string, unknown> = {
  current_user_role: 'admin',
  slug: 'glow-bar',
  pricing_tier: 'plus',
  booking_model: 'unified_scheduling',
  active_booking_models: ['unified_scheduling', 'class_session', 'resource_booking', 'event_ticket'],
};
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue }),
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

// --- Mutation + query hook mocks (all mock-prefixed for jest hoisting) -------
const mockPatchMutateAsync = jest.fn((_input?: unknown) => Promise.resolve({}));
const mockCreateMutateAsync = jest.fn(() => Promise.resolve({ id: 'new', name: 'New' }));
const mockDeleteMutateAsync = jest.fn((_id?: unknown) => Promise.resolve({}));
// "Who is still booked on this calendar?": nobody, unless a test says otherwise.
const NOBODY_BOOKED = { total: 0, bookings: [], truncated: false };
const mockUpcomingCheck = jest.fn(
  (_id?: unknown): Promise<unknown> => Promise.resolve(NOBODY_BOOKED),
);

/** Two people still booked with Alex, as the pre-check and the 409 both list them. */
const TWO_BOOKED = {
  total: 2,
  truncated: false,
  bookings: [
    {
      key: 'b1',
      kind: 'appointment',
      booking_ids: ['b1'],
      booking_date: '2026-11-30',
      booking_time: '10:00',
      end_time: '10:45',
      who: 'Priya Shah',
      what: 'Cut',
      status: 'Booked',
    },
    {
      key: 'b2',
      kind: 'appointment',
      booking_ids: ['b2'],
      booking_date: '2026-12-01',
      booking_time: '14:00',
      end_time: null,
      who: 'Tom Reid',
      what: 'Colour',
      status: 'Confirmed',
    },
  ],
};

/** Flip the first card's "Active (bookable)" switch (Alex). */
async function setAlexActive(active: boolean) {
  await act(async () => {
    fireEvent(screen.getAllByRole('switch')[0]!, 'valueChange', active);
  });
}

const mockPractitioners = [
  { id: 'c1', name: 'Alex', slug: 'alex', is_active: true, sort_order: 0 },
  { id: 'c2', name: 'Sam', slug: null, is_active: true, sort_order: 1 },
];
const mockRefetch = jest.fn();

jest.mock('@/lib/queries/usePractitioners', () => ({
  usePractitioners: () => ({
    data: { practitioners: mockPractitioners },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: mockRefetch,
  }),
  useCreateHostCalendar: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
}));
jest.mock('@/lib/queries/useAvailabilityManage', () => ({
  usePatchPractitioner: () => ({ mutateAsync: mockPatchMutateAsync, isPending: false }),
  useDeletePractitioner: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
  useCalendarUpcomingBookingsCheck: () => ({ mutateAsync: mockUpcomingCheck, isPending: false }),
}));
jest.mock('@/lib/queries/useServicesManage', () => ({
  useManagedServices: () => ({
    data: {
      services: [{ id: 's1', name: 'Cut' }],
      practitioner_services: [{ practitioner_id: 'c1', service_id: 's1' }],
    },
  }),
}));
jest.mock('@/lib/queries/useClassesManage', () => ({
  useManagedClasses: () => ({ data: { class_types: [] } }),
  useUpdateClassType: () => ({ mutateAsync: mockUpdateClassType }),
}));
jest.mock('@/lib/queries/useResourcesManage', () => ({
  useResourcesManageList: () => ({ data: [] }),
  useUpdateResource: () => ({ mutateAsync: mockUpdateResource }),
}));
jest.mock('@/lib/queries/useEventsManage', () => ({
  useManagedEvents: () => ({ data: [] }),
  useUpdateEvent: () => ({ mutateAsync: mockUpdateEvent }),
}));
const mockUpdateClassType = jest.fn((_input?: unknown) => Promise.resolve({}));
const mockUpdateResource = jest.fn((_input?: unknown) => Promise.resolve({}));
const mockUpdateEvent = jest.fn((_input?: unknown) => Promise.resolve({}));
const mockSetServices = jest.fn((_input?: unknown) => Promise.resolve({}));
jest.mock('@/lib/queries/useToggleCalendarService', () => ({
  useToggleCalendarService: () => ({ mutateAsync: mockSetServices }),
}));
// The assignments sheet carries the service-removal flow, which moves a booking
// through the reschedule mutation when the operator asks it to. Stubbed here so
// this suite keeps rendering without a QueryClientProvider.
const mockRescheduleById = jest.fn((_input?: unknown) => Promise.resolve({}));
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useRescheduleBookingById: () => ({ mutateAsync: mockRescheduleById }),
}));

// The plan allowance and the column conflicts: unknown (null / none) unless a
// test sets them, which is also what the app gets while the routes are cookie-only.
let mockEntitlement: unknown = null;
let mockEntitlementError = false;
let mockConflicts: unknown[] = [];
jest.mock('@/lib/queries/useCalendarEntitlement', () => ({
  useCalendarEntitlement: () => ({ data: mockEntitlement, isError: mockEntitlementError }),
  useCalendarColumnConflicts: () => ({ data: mockConflicts }),
}));

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => {
  mockPatchMutateAsync.mockClear();
  mockCreateMutateAsync.mockClear();
  mockDeleteMutateAsync.mockClear();
  mockUpcomingCheck.mockReset();
  mockUpcomingCheck.mockImplementation(() => Promise.resolve(NOBODY_BOOKED));
  mockClipboard.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockRefetch.mockClear();
  mockUpdateClassType.mockClear();
  mockUpdateResource.mockClear();
  mockUpdateEvent.mockClear();
  mockSetServices.mockClear();
  mockEntitlement = null;
  mockEntitlementError = false;
  mockConflicts = [];
});

/** An allowance with room, for tests that need Add calendar on screen. */
const ROOM_ON_PLAN = {
  pricing_tier: 'plus',
  calendar_count: null,
  active_practitioners: 2,
  calendar_limit: 5,
  unlimited: false,
  at_calendar_limit: false,
  can_add_practitioner: true,
  unified_calendar_count: 2,
};

describe('BookableCalendarsManager', () => {
  it('shows classes, resources and events only while the venue has them switched on', async () => {
    await render(<BookableCalendarsManager />);
    expect(screen.getAllByText('Resources').length).toBeGreaterThan(0);
    await cleanup();
    const previous = mockVenue;
    mockVenue = { ...previous, active_booking_models: ['unified_scheduling'] };
    try {
      await render(<BookableCalendarsManager />);
      expect(screen.queryByText('Resources')).toBeNull();
      expect(screen.queryByText('Classes')).toBeNull();
      expect(screen.queryByText('Events')).toBeNull();
    } finally {
      mockVenue = previous;
    }
  });

  it('lists every calendar with its assignments', async () => {
    await render(<BookableCalendarsManager />);
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByText('Sam')).toBeTruthy();
    // Alex has the "Cut" service assigned.
    expect(screen.getByText('Cut')).toBeTruthy();
  });

  it('reorders via the down button → PATCHes dense sort_order', async () => {
    await render(<BookableCalendarsManager />);

    // Move Alex (index 0) down → [Sam, Alex] persisted as sort_order 0,1.
    await press(() => screen.getByLabelText('Move Alex down'));

    const calls = mockPatchMutateAsync.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(
      expect.arrayContaining([
        { id: 'c2', sort_order: 0 },
        { id: 'c1', sort_order: 1 },
      ]),
    );
  });

  it('saves a booking-link slug then copies the public URL', async () => {
    await render(<BookableCalendarsManager />);

    // Sam (2nd card) has no slug — type one, Save.
    const segInputs = screen.getAllByPlaceholderText('segment');
    await act(async () => {
      fireEvent.changeText(segInputs[1], 'sam-c');
    });
    await press(() => screen.getAllByText('Save link')[1]);
    expect(mockPatchMutateAsync).toHaveBeenCalledWith({ id: 'c2', slug: 'sam-c' });

    // Alex already has slug "alex" → Copy writes the public booking URL.
    await press(() => screen.getAllByText('Copy URL')[0]);
    await waitFor(() =>
      expect(mockClipboard).toHaveBeenCalledWith('https://app.resneo.com/book/glow-bar/alex'),
    );
  });

  it('deletes a calendar through the confirm sheet', async () => {
    await render(<BookableCalendarsManager />);

    await press(() => screen.getByLabelText('Delete Alex'));
    expect(screen.getByText('Remove calendar?')).toBeTruthy();

    await press(() => screen.getByText('Remove calendar'));
    expect(mockDeleteMutateAsync).toHaveBeenCalledWith('c1');
  });

  it('says what removal really does, not that bookings stay on the diary (R44-2)', async () => {
    await render(<BookableCalendarsManager />);
    await press(() => screen.getByLabelText('Delete Alex'));

    expect(mockUpcomingCheck).toHaveBeenCalledWith('c1');
    expect(screen.getByText(/Alex will be removed for good/)).toBeTruthy();
    expect(screen.getByText(/It has no upcoming bookings/)).toBeTruthy();
    expect(screen.getByText(/they no longer appear on your diary/)).toBeTruthy();
    expect(screen.queryByText(/Existing bookings stay on the diary/)).toBeNull();
  });

  it('lists the upcoming bookings instead of offering to remove (R44-2)', async () => {
    mockUpcomingCheck.mockImplementation(() => Promise.resolve(TWO_BOOKED));
    await render(<BookableCalendarsManager />);
    await press(() => screen.getByLabelText('Delete Alex'));

    expect(screen.getByText('Alex cannot be removed yet')).toBeTruthy();
    expect(screen.getByText('Alex still has 2 upcoming bookings:')).toBeTruthy();
    expect(screen.getByText('Mon 30 Nov, 10:00 to 10:45')).toBeTruthy();
    expect(screen.getByText('Priya Shah, Cut')).toBeTruthy();
    expect(screen.getByText('Tue 1 Dec, 14:00')).toBeTruthy();
    expect(screen.getByText('Move or cancel them first, then remove the calendar.')).toBeTruthy();
    expect(screen.getByText(/pause Alex instead/)).toBeTruthy();
    // Nothing to confirm: the only way out is Close, and nothing is deleted.
    expect(screen.queryByText('Remove calendar')).toBeNull();
    await press(() => screen.getByText('Close'));
    expect(mockDeleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText('Alex cannot be removed yet')).toBeNull();
  });

  it('shows the list from the 409 when someone booked after the sheet opened (R44-2)', async () => {
    mockDeleteMutateAsync.mockRejectedValueOnce(
      new ApiError('Alex still has 2 upcoming appointments.', 409, {
        error: 'Alex still has 2 upcoming appointments.',
        code: 'CALENDAR_HAS_UPCOMING_BOOKINGS',
        upcoming_total: 2,
        upcoming_bookings: TWO_BOOKED.bookings,
        upcoming_truncated: false,
      }),
    );
    await render(<BookableCalendarsManager />);
    await press(() => screen.getByLabelText('Delete Alex'));
    await press(() => screen.getByText('Remove calendar'));

    await waitFor(() => expect(screen.getByText('Alex cannot be removed yet')).toBeTruthy());
    expect(screen.getByText('Tom Reid, Colour')).toBeTruthy();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('still toasts a removal refused for another reason', async () => {
    mockDeleteMutateAsync.mockRejectedValueOnce(
      new ApiError('You need at least one calendar.', 409, {
        error: 'You need at least one calendar.',
      }),
    );
    await render(<BookableCalendarsManager />);
    await press(() => screen.getByLabelText('Delete Alex'));
    await press(() => screen.getByText('Remove calendar'));

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('You need at least one calendar.'),
    );
    expect(screen.getByText('Remove calendar?')).toBeTruthy();
  });

  it('lets a removal through when the check cannot be made, and says the server decides', async () => {
    mockUpcomingCheck.mockImplementation(() => Promise.reject(new ApiError('Server error', 500)));
    await render(<BookableCalendarsManager />);
    await press(() => screen.getByLabelText('Delete Alex'));
    expect(screen.getByText(/We could not check for upcoming bookings just now/)).toBeTruthy();

    await press(() => screen.getByText('Remove calendar'));
    expect(mockDeleteMutateAsync).toHaveBeenCalledWith('c1');
  });

  it('pauses straight away when nobody is booked (R44-4)', async () => {
    await render(<BookableCalendarsManager />);
    await setAlexActive(false);

    expect(mockUpcomingCheck).toHaveBeenCalledWith('c1');
    expect(mockPatchMutateAsync).toHaveBeenCalledWith({ id: 'c1', is_active: false });
    expect(screen.queryByText('Pause Alex?')).toBeNull();
  });

  it('warns before pausing a calendar with bookings, and saves only on Pause calendar (R44-4)', async () => {
    mockUpcomingCheck.mockImplementation(() => Promise.resolve(TWO_BOOKED));
    await render(<BookableCalendarsManager />);
    await setAlexActive(false);

    expect(screen.getByText('Pause Alex?')).toBeTruthy();
    expect(screen.getByText('Alex still has 2 upcoming bookings:')).toBeTruthy();
    expect(screen.getByText('Priya Shah, Cut')).toBeTruthy();
    expect(screen.getByText('If you pause Alex:')).toBeTruthy();
    expect(screen.getByText(/They all stay booked\. Your clients are not told anything\./)).toBeTruthy();
    expect(screen.getByText(/marked Paused, so nobody is missed/)).toBeTruthy();
    expect(mockPatchMutateAsync).not.toHaveBeenCalled();

    await press(() => screen.getByText('Pause calendar'));
    expect(mockPatchMutateAsync).toHaveBeenCalledWith({ id: 'c1', is_active: false });
    await waitFor(() => expect(screen.queryByText('Pause Alex?')).toBeNull());
  });

  it('Go back leaves the calendar switched on (R44-4)', async () => {
    mockUpcomingCheck.mockImplementation(() => Promise.resolve(TWO_BOOKED));
    await render(<BookableCalendarsManager />);
    await setAlexActive(false);
    await press(() => screen.getByText('Go back'));

    expect(screen.queryByText('Pause Alex?')).toBeNull();
    expect(mockPatchMutateAsync).not.toHaveBeenCalled();
  });

  it('does not pause when the check fails, and says so (R44-4)', async () => {
    mockUpcomingCheck.mockImplementation(() => Promise.reject(new ApiError('Server error', 500)));
    await render(<BookableCalendarsManager />);
    await setAlexActive(false);

    expect(mockPatchMutateAsync).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(
      'We could not check the bookings on Alex, so nothing was changed. Please try again.',
    );
  });

  it('pauses as before on a server that has no such check (404)', async () => {
    mockUpcomingCheck.mockImplementation(() => Promise.reject(new ApiError('Not found', 404)));
    await render(<BookableCalendarsManager />);
    await setAlexActive(false);

    expect(mockPatchMutateAsync).toHaveBeenCalledWith({ id: 'c1', is_active: false });
  });

  it('never asks when a calendar is switched back on', async () => {
    await render(<BookableCalendarsManager />);
    await setAlexActive(true);

    expect(mockUpcomingCheck).not.toHaveBeenCalled();
    expect(mockPatchMutateAsync).toHaveBeenCalledWith({ id: 'c1', is_active: true });
  });

  it('shows an upgrade notice when create hits the plan calendar limit (403)', async () => {
    // The allowance said there was room; the route disagreed (a stale answer).
    mockEntitlement = ROOM_ON_PLAN;
    mockCreateMutateAsync.mockRejectedValueOnce(
      new ApiError('Upgrade your plan to add more calendars.', 403, {
        upgrade_required: true,
        error: 'Upgrade your plan to add more calendars.',
      }),
    );
    await render(<BookableCalendarsManager />);

    await press(() => screen.getByText('Add calendar'));
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('e.g. Studio A'), 'Studio B');
    });
    await press(() => screen.getByText('Add'));

    // The plan-limit message surfaces inline (not as a raw error toast).
    await waitFor(() => expect(screen.getByText(/Upgrade your plan/)).toBeTruthy());
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('shows the plan pill and, at the limit, withholds Add calendar and says why', async () => {
    mockEntitlement = {
      pricing_tier: 'plus',
      calendar_count: null,
      active_practitioners: 5,
      calendar_limit: 5,
      unlimited: false,
      at_calendar_limit: true,
      can_add_practitioner: false,
      unified_calendar_count: 5,
    };
    await render(<BookableCalendarsManager />);
    expect(screen.getByText('5 / 5 on plan')).toBeTruthy();
    expect(screen.queryByText('Add calendar')).toBeNull();
    expect(screen.getByText(/Appointments Plus includes up to five bookable calendars/)).toBeTruthy();
  });

  it('withholds Add calendar until the allowance is known (web parity)', async () => {
    await render(<BookableCalendarsManager />);
    expect(screen.queryByText('Add calendar')).toBeNull();
    expect(screen.queryByText(/on plan/)).toBeNull();
  });

  it('shows Add calendar and the pill once the allowance loads with room', async () => {
    mockEntitlement = ROOM_ON_PLAN;
    await render(<BookableCalendarsManager />);
    expect(screen.getByText('Add calendar')).toBeTruthy();
    expect(screen.getByText('2 / 5 on plan')).toBeTruthy();
  });

  it('keeps Add calendar when the allowance cannot be loaded (the route enforces the limit)', async () => {
    mockEntitlementError = true;
    await render(<BookableCalendarsManager />);
    expect(screen.getByText('Add calendar')).toBeTruthy();
    expect(screen.queryByText(/on plan/)).toBeNull();
  });

  it('hides the pill when the plan has no number to show', async () => {
    mockEntitlement = { ...ROOM_ON_PLAN, calendar_limit: null, unlimited: false };
    await render(<BookableCalendarsManager />);
    expect(screen.queryByText(/on plan/)).toBeNull();
    expect(screen.getByText('Add calendar')).toBeTruthy();
  });

  it('flags a resource overlap on its card', async () => {
    mockConflicts = [{ calendar_id: 'c1', messages: ['Room A and Room B both offer 10:00–11:00.'] }];
    await render(<BookableCalendarsManager />);
    expect(screen.getByText('Conflict')).toBeTruthy();
    expect(screen.getByText('Resource availability overlap')).toBeTruthy();
    expect(screen.getByText(/Room A and Room B both offer/)).toBeTruthy();
  });

  it('edits the services on a calendar from the calendar and PUTs the full set', async () => {
    await render(<BookableCalendarsManager />);
    await press(() => screen.getAllByText('Edit assignments')[0]!);
    expect(screen.getByText('Assignments for Alex')).toBeTruthy();
    // "Cut" is on Alex; untick it and save.
    await act(async () => {
      fireEvent(screen.getByLabelText('Cut'), 'valueChange', false);
    });
    await press(() => screen.getByText('Save'));
    await waitFor(() =>
      expect(mockSetServices).toHaveBeenCalledWith({
        practitioner_id: 'c1',
        service_ids: [],
        acknowledge: false,
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith('Calendar updated.');
  });

  /**
   * R35-1: unticking a service that still has upcoming bookings is not a
   * refusal. The route lists them; the sheet turns into that list (never a
   * second Sheet over this one) and the same save goes again acknowledged.
   */
  it('shows the bookings left behind and re-saves acknowledged', async () => {
    mockSetServices.mockRejectedValueOnce(
      new ApiError('2 upcoming bookings are already booked for Cut on Alex.', 409, {
        requires_confirmation: true,
        message: '2 upcoming bookings are already booked for Cut on Alex.',
        error: '2 upcoming bookings are already booked for Cut on Alex.',
        affected_bookings: [
          {
            id: 'b1',
            service_id: 's1',
            service_name: 'Cut',
            calendar_id: 'c1',
            calendar_name: 'Alex',
            booking_date: '2026-10-14',
            booking_time: '10:00',
            end_time: '11:00',
            guest_name: 'Alex Smith',
            party_size: 1,
            status: 'Booked',
          },
        ],
        affected_total: 1,
        affected_truncated: false,
      }),
    );

    await render(<BookableCalendarsManager />);
    await press(() => screen.getAllByText('Edit assignments')[0]!);
    await act(async () => {
      fireEvent(screen.getByLabelText('Cut'), 'valueChange', false);
    });
    await press(() => screen.getByText('Save'));

    // The list replaced the tick list in the SAME sheet.
    await waitFor(() => expect(screen.getByText('Cut on Alex')).toBeTruthy());
    expect(screen.getByText('Wed 14 Oct, 10:00 to 11:00')).toBeTruthy();
    expect(mockToast.success).not.toHaveBeenCalled();

    await press(() => screen.getByText('Save and leave these bookings here'));
    await waitFor(() =>
      expect(mockSetServices).toHaveBeenLastCalledWith({
        practitioner_id: 'c1',
        service_ids: [],
        acknowledge: true,
      }),
    );
    expect(mockRescheduleById).not.toHaveBeenCalled(); // nothing was moved
    expect(mockToast.success).toHaveBeenCalledWith('Calendar updated.');
  });

  /**
   * Web's R35 reply: cancelling the question wrote nothing, so a tick list still
   * showing the service as unticked would say the removal happened.
   */
  it('re-ticks the service when the question is cancelled, and saves nothing', async () => {
    mockSetServices.mockRejectedValueOnce(
      new ApiError('1 upcoming booking is already booked for Cut on Alex.', 409, {
        requires_confirmation: true,
        message: '1 upcoming booking is already booked for Cut on Alex.',
        affected_bookings: [
          {
            id: 'b1',
            service_id: 's1',
            service_name: 'Cut',
            calendar_id: 'c1',
            calendar_name: 'Alex',
            booking_date: '2026-10-14',
            booking_time: '10:00',
            end_time: '11:00',
            guest_name: 'Alex Smith',
            party_size: 1,
            status: 'Booked',
          },
        ],
        affected_total: 1,
        affected_truncated: false,
      }),
    );

    await render(<BookableCalendarsManager />);
    await press(() => screen.getAllByText('Edit assignments')[0]!);
    await act(async () => {
      fireEvent(screen.getByLabelText('Cut'), 'valueChange', false);
    });
    await press(() => screen.getByText('Save'));
    await waitFor(() => expect(screen.getByText('Cut on Alex')).toBeTruthy());

    await press(() => screen.getByText('Cancel'));

    // Back on the tick list, with the service ticked again.
    await waitFor(() => expect(screen.getByLabelText('Cut').props.value).toBe(true));
    expect(mockSetServices).toHaveBeenCalledTimes(1); // only the refused attempt
    expect(mockToast.success).not.toHaveBeenCalled();
  });
});

describe('calendarSetupList', () => {
  it('names only what the venue has switched on', () => {
    expect(calendarSetupList({ classes: false, resources: false, events: false })).toBe('name and services');
    expect(calendarSetupList({ classes: true, resources: false, events: true })).toBe(
      'name, services, classes and events',
    );
  });
});
