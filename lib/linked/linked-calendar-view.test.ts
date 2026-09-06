import {
  fmtTime,
  linkedActionLabel,
  linkedBookingLabel,
  linkedBusyBlock,
  linkedGridBooking,
  linkedHasTemplate,
  linkedOpenRanges,
  linkedColumnKey,
  linkedDayHeading,
  linkedScheduleBlocksForColumn,
  linkedScheduleBlocksForDate,
  linkedSharedCalendars,
  linkedSwitcherEntries,
  linkedSwitcherEntryCount,
  linkedVenueColumns,
  linkedVenueDayHours,
  linkedWeekHeading,
  narrowLinkedVenueToCalendar,
  parseLinkedColumnKey,
  rangesToWorkingHours,
} from '@/lib/linked/linked-calendar-view';
import type {
  LinkedBooking,
  LinkedPractitioner,
  LinkedVenueCalendar,
} from '@/types/linked-venues';
import type { ScheduleBlockDTO } from '@/types/schedule-blocks';

// A fixed date + its local weekday so the working-hours key lookup is robust
// regardless of the runner's locale (mirrors working-hours.test.ts).
const DATE = '2026-06-15';
const WEEKDAY = String(new Date(2026, 5, 15).getDay());

function booking(overrides: Partial<LinkedBooking> = {}): LinkedBooking {
  return {
    id: 'b1',
    practitionerId: 'p1',
    bookingDate: DATE,
    bookingTime: '09:00:00',
    bookingEndTime: '09:30:00',
    status: 'Booked',
    guestName: 'Ada Lovelace',
    serviceName: 'Cut & Finish',
    editable: true,
    ...overrides,
  };
}

function practitioner(overrides: Partial<LinkedPractitioner> = {}): LinkedPractitioner {
  return { id: 'p1', name: 'Sam', isActive: true, ...overrides };
}

function venue(overrides: Partial<LinkedVenueCalendar> = {}): LinkedVenueCalendar {
  return {
    venueId: 'v1',
    venueName: 'Mirror & Co',
    linkId: 'l1',
    visibility: 'full_details',
    action: 'edit_existing',
    pii: true,
    practitioners: [practitioner()],
    services: [],
    resources: [],
    bookings: [],
    ...overrides,
  };
}

function scheduleDto(overrides: Partial<ScheduleBlockDTO> = {}): ScheduleBlockDTO {
  return {
    id: 's1',
    kind: 'event_ticket',
    date: DATE,
    start_time: '10:00:00',
    end_time: '11:00:00',
    title: 'Yoga',
    ...overrides,
  };
}

describe('fmtTime', () => {
  it('trims seconds and tolerates null/undefined', () => {
    expect(fmtTime('09:30:00')).toBe('09:30');
    expect(fmtTime('09:30')).toBe('09:30');
    expect(fmtTime(null)).toBe('');
    expect(fmtTime(undefined)).toBe('');
  });
});

describe('linkedActionLabel', () => {
  it('reflects the grant: time_only / view-only / edit / (none for full create)', () => {
    expect(linkedActionLabel(venue({ visibility: 'time_only' }))).toBe('Time blocks only');
    expect(linkedActionLabel(venue({ visibility: 'full_details', action: 'none' }))).toBe('View only');
    expect(linkedActionLabel(venue({ visibility: 'full_details', action: 'edit_existing' }))).toBe(
      'Edit existing',
    );
    expect(
      linkedActionLabel(venue({ visibility: 'full_details', action: 'create_edit_cancel' })),
    ).toBeNull();
  });
});

describe('linkedBookingLabel', () => {
  it('uses the client name when the link shares it', () => {
    expect(linkedBookingLabel(booking())).toBe('Ada Lovelace');
  });

  it('falls back to the service when the link hides the client name (no PII grant)', () => {
    expect(linkedBookingLabel(booking({ guestName: null }))).toBe('Cut & Finish');
  });

  it('falls back to "Booking" when neither is available', () => {
    expect(linkedBookingLabel(booking({ guestName: null, serviceName: null }))).toBe('Booking');
  });

  it('treats a blank name as absent rather than rendering empty text', () => {
    expect(linkedBookingLabel(booking({ guestName: '   ' }))).toBe('Cut & Finish');
    expect(linkedBookingLabel(booking({ guestName: '', serviceName: '  ' }))).toBe('Booking');
  });
});

describe('linkedGridBooking', () => {
  it('maps times to HH:mm, attendance fields, and folds the practitioner name into the service label', () => {
    const result = linkedGridBooking(booking(), [practitioner({ id: 'p1', name: 'Sam' })]);
    expect(result).toMatchObject({
      id: 'b1',
      guestName: 'Ada Lovelace',
      serviceName: 'Cut & Finish · Sam',
      startTime: '09:00',
      endTime: '09:30',
      status: 'Booked',
    });
  });

  it('falls back guestName → serviceName → "Booking"', () => {
    expect(
      linkedGridBooking(booking({ guestName: null, serviceName: 'Massage' }), []).guestName,
    ).toBe('Massage');
    expect(
      linkedGridBooking(booking({ guestName: null, serviceName: null }), []).guestName,
    ).toBe('Booking');
  });

  it('uses the bare service label when the practitioner is unknown, and "" for a missing end', () => {
    const result = linkedGridBooking(
      booking({ practitionerId: 'ghost', bookingEndTime: null }),
      [practitioner({ id: 'p1' })],
    );
    expect(result.serviceName).toBe('Cut & Finish');
    expect(result.endTime).toBe('');
  });

  it('maps attendance timestamps and defaults them to null', () => {
    const withArrival = linkedGridBooking(booking({ clientArrivedAt: '2026-06-15T09:05:00Z' }), []);
    expect(withArrival.client_arrived_at).toBe('2026-06-15T09:05:00Z');
    const without = linkedGridBooking(booking(), []);
    expect(without.client_arrived_at).toBeNull();
    expect(without.staff_attendance_confirmed_at).toBeNull();
    expect(without.guest_attendance_confirmed_at).toBeNull();
  });
});

describe('linkedBusyBlock', () => {
  it('renders a non-interactive "{venue} — busy" block', () => {
    expect(
      linkedBusyBlock(booking({ bookingTime: '14:00:00', bookingEndTime: '15:00:00' }), 'Mirror & Co'),
    ).toEqual({
      id: 'b1',
      start: '14:00',
      end: '15:00',
      label: 'Mirror & Co — busy',
      isEditable: false,
    });
  });

  it('falls back the end to the start when no end time is given', () => {
    expect(linkedBusyBlock(booking({ bookingTime: '14:00:00', bookingEndTime: null }), 'X').end).toBe(
      '14:00',
    );
  });
});

describe('linkedOpenRanges', () => {
  it('unions every practitioner working that day', () => {
    const v = venue({
      practitioners: [
        practitioner({ id: 'p1', workingHours: { [WEEKDAY]: [{ start: '09:00', end: '12:00' }] } }),
        practitioner({ id: 'p2', workingHours: { [WEEKDAY]: [{ start: '13:00', end: '17:00' }] } }),
      ],
    });
    expect(linkedOpenRanges(v, DATE)).toEqual([
      { start: 540, end: 720 },
      { start: 780, end: 1020 },
    ]);
  });

  it('is empty when nobody works that day', () => {
    expect(linkedOpenRanges(venue({ practitioners: [practitioner({ workingHours: {} })] }), DATE)).toEqual(
      [],
    );
  });
});

describe('linkedHasTemplate', () => {
  it('is true when any practitioner publishes hours, false otherwise', () => {
    expect(
      linkedHasTemplate(
        venue({ practitioners: [practitioner({ workingHours: { '1': [{ start: '09:00', end: '17:00' }] } })] }),
      ),
    ).toBe(true);
    expect(linkedHasTemplate(venue({ practitioners: [practitioner({ workingHours: {} })] }))).toBe(false);
  });
});

describe('linkedVenueDayHours', () => {
  it('is open with periods, closed with a template but no hours, unknown without a template', () => {
    expect(linkedVenueDayHours([{ start: 540, end: 1020 }], true)).toEqual({
      kind: 'open',
      periods: [{ start: 540, end: 1020 }],
    });
    expect(linkedVenueDayHours([], true)).toEqual({ kind: 'closed' });
    expect(linkedVenueDayHours([], false)).toEqual({ kind: 'unknown' });
  });
});

describe('rangesToWorkingHours', () => {
  it('converts minute ranges back to HH:mm windows', () => {
    expect(rangesToWorkingHours([{ start: 540, end: 1020 }])).toEqual([{ start: '09:00', end: '17:00' }]);
  });
});

describe('linkedScheduleBlocksForDate', () => {
  it('keeps only the requested date and maps to render-ready blocks', () => {
    const v = venue({
      scheduleBlocks: [
        scheduleDto({ id: 's1', date: DATE, title: 'Yoga' }),
        scheduleDto({ id: 's2', date: '2026-06-16', title: 'Pilates' }),
      ],
    });
    const result = linkedScheduleBlocksForDate(v, DATE);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 's1', title: 'Yoga', startTime: '10:00:00', endTime: '11:00:00' });
  });

  it('collapses duplicate class sessions to one block (richest booked-count wins)', () => {
    const v = venue({
      scheduleBlocks: [
        scheduleDto({ id: 'a', kind: 'class_session', class_instance_id: 'ci1', class_booked_spots: 1 }),
        scheduleDto({ id: 'b', kind: 'class_session', class_instance_id: 'ci1', class_booked_spots: 3 }),
      ],
    });
    const result = linkedScheduleBlocksForDate(v, DATE);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('b');
  });
});

describe('linkedGridBooking on a per-calendar column', () => {
  it('keeps the bare service when the column already names the practitioner', () => {
    const result = linkedGridBooking(booking(), [practitioner({ id: 'p1', name: 'Sam' })], {
      practitionerInLabel: false,
    });
    expect(result.serviceName).toBe('Cut & Finish');
  });
});

describe('linkedColumnKey / parseLinkedColumnKey', () => {
  it('namespaces a calendar under its venue and parses both shapes back', () => {
    expect(linkedColumnKey('v1', 'p1')).toBe('linked:v1:p1');
    expect(linkedColumnKey('v1')).toBe('linked:v1');
    expect(parseLinkedColumnKey('linked:v1:p1')).toEqual({ venueId: 'v1', practitionerId: 'p1' });
    expect(parseLinkedColumnKey('linked:v1')).toEqual({ venueId: 'v1', practitionerId: null });
    expect(parseLinkedColumnKey('p1')).toBeNull();
    expect(parseLinkedColumnKey('linked:')).toBeNull();
  });
});

describe('linkedVenueColumns', () => {
  const HOURS = { [WEEKDAY]: [{ start: '09:00', end: '17:00' }] };
  const jenny = practitioner({ id: 'p1', name: 'Jenny', workingHours: HOURS });
  const sam = practitioner({ id: 'p2', name: 'Sam' });

  it('draws one column per calendar, named after it, with its own bookings and hours', () => {
    const v = venue({
      venueName: 'light2',
      practitioners: [jenny, sam],
      bookings: [
        booking({ id: 'b1', practitionerId: 'p1' }),
        booking({ id: 'b2', practitionerId: 'p2' }),
        booking({ id: 'b3', practitionerId: 'p1', bookingDate: '2026-06-16' }),
      ],
    });
    const cols = linkedVenueColumns(v, DATE);
    expect(cols.map((c) => [c.key, c.name])).toEqual([
      ['linked:v1:p1', 'Jenny'],
      ['linked:v1:p2', 'Sam'],
    ]);
    expect(cols[0]!.bookings.map((b) => b.id)).toEqual(['b1']);
    expect(cols[1]!.bookings.map((b) => b.id)).toEqual(['b2']);
    expect(cols[0]!.openRanges).toEqual([{ start: 540, end: 1020 }]);
    expect(cols[0]!.hasTemplate).toBe(true);
    expect(cols[1]!.openRanges).toEqual([]);
    expect(cols[1]!.hasTemplate).toBe(false);
    expect(cols[0]!.venue).toBe(v);
  });

  it('drops an inactive calendar unless it still holds a booking that day', () => {
    const idle = practitioner({ id: 'p3', name: 'Idle', isActive: false });
    expect(
      linkedVenueColumns(venue({ practitioners: [jenny, idle] }), DATE).map((c) => c.name),
    ).toEqual(['Jenny']);
    const withBooking = venue({
      practitioners: [jenny, idle],
      bookings: [booking({ id: 'b9', practitionerId: 'p3' })],
    });
    expect(linkedVenueColumns(withBooking, DATE).map((c) => c.name)).toEqual(['Jenny', 'Idle']);
  });

  it('keeps a venue-level column for bookings that name no listed calendar', () => {
    const v = venue({
      venueName: 'light2',
      practitioners: [jenny],
      bookings: [
        booking({ id: 'b1', practitionerId: 'p1' }),
        booking({ id: 'b2', practitionerId: null }),
        booking({ id: 'b3', practitionerId: 'p-unknown' }),
      ],
    });
    const cols = linkedVenueColumns(v, DATE);
    expect(cols.map((c) => c.key)).toEqual(['linked:v1:p1', 'linked:v1']);
    expect(cols[1]).toMatchObject({ name: 'light2', practitionerId: null });
    expect(cols[1]!.bookings.map((b) => b.id)).toEqual(['b2', 'b3']);
    // The venue-level column reads the venue's union of templates.
    expect(cols[1]!.openRanges).toEqual([{ start: 540, end: 1020 }]);
  });

  it('keeps one venue column when the partner lists no calendars at all', () => {
    const cols = linkedVenueColumns(venue({ practitioners: [], bookings: [booking()] }), DATE);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toMatchObject({
      key: 'linked:v1',
      name: 'Mirror & Co',
      practitionerId: null,
      hasTemplate: false,
    });
    expect(cols[0]!.bookings).toHaveLength(1);
  });
});

describe('linkedScheduleBlocksForColumn', () => {
  it('gives a calendar its own blocks and the venue-level column the unassigned ones', () => {
    const v = venue({
      practitioners: [practitioner({ id: 'p1', name: 'Jenny' })],
      scheduleBlocks: [
        scheduleDto({ id: 's1', date: DATE, title: 'Yoga', calendar_id: 'p1' }),
        scheduleDto({ id: 's2', date: DATE, title: 'Pop-up', calendar_id: null }),
        scheduleDto({ id: 's3', date: DATE, title: 'Elsewhere', calendar_id: 'p-unknown' }),
        scheduleDto({ id: 's4', date: '2026-06-16', title: 'Tomorrow', calendar_id: 'p1' }),
      ],
    });
    expect(
      linkedScheduleBlocksForColumn(v, { practitionerId: 'p1' }, DATE).map((b) => b.id),
    ).toEqual(['s1']);
    expect(
      linkedScheduleBlocksForColumn(v, { practitionerId: null }, DATE).map((b) => b.id),
    ).toEqual(['s2', 's3']);
  });
});

describe('linkedSharedCalendars / linkedWeekHeading', () => {
  const jenny = practitioner({ id: 'p1', name: 'Jenny' });
  const sam = practitioner({ id: 'p2', name: 'Sam' });
  const idle = practitioner({ id: 'p3', name: 'Idle', isActive: false });

  it('lists the active calendars, plus an inactive one still holding a booking', () => {
    expect(linkedSharedCalendars(venue({ practitioners: [jenny, idle] })).map((p) => p.name)).toEqual([
      'Jenny',
    ]);
    expect(
      linkedSharedCalendars(
        venue({ practitioners: [jenny, idle], bookings: [booking({ practitionerId: 'p3' })] }),
      ).map((p) => p.name),
    ).toEqual(['Jenny', 'Idle']);
  });

  it('heads a single shared calendar with its name, the venue under it', () => {
    expect(linkedWeekHeading(venue({ venueName: 'light2', practitioners: [jenny] }))).toEqual({
      title: 'Jenny',
      caption: 'light2',
    });
  });

  it('keeps the venue name over several calendars, listing them, and alone over none', () => {
    expect(linkedWeekHeading(venue({ venueName: 'light2', practitioners: [jenny, sam] }))).toEqual({
      title: 'light2',
      caption: 'Jenny, Sam',
    });
    expect(linkedWeekHeading(venue({ venueName: 'light2', practitioners: [] }))).toEqual({
      title: 'light2',
    });
  });
});

describe('linkedSwitcherEntries / linkedSwitcherEntryCount', () => {
  const jenny = practitioner({ id: 'p1', name: 'Jenny' });
  const sam = practitioner({ id: 'p2', name: 'Sam' });

  it('lists one chip per shared calendar, keyed by the column, counting its bookings', () => {
    const v = venue({
      venueName: 'light2',
      practitioners: [jenny, sam],
      bookings: [
        booking({ id: 'b1', practitionerId: 'p1' }),
        booking({ id: 'b2', practitionerId: 'p1' }),
        booking({ id: 'b3', practitionerId: 'p2', bookingDate: '2026-06-16' }),
      ],
    });
    const entries = linkedSwitcherEntries([v], ['Alex']);
    expect(entries.map((e) => [e.key, e.label, e.practitionerId])).toEqual([
      ['linked:v1:p1', 'Jenny', 'p1'],
      ['linked:v1:p2', 'Sam', 'p2'],
    ]);
    expect(entries.map((e) => linkedSwitcherEntryCount(e, DATE))).toEqual([2, 0]);
  });

  it('carries the venue on a name shared with an own calendar or another partner', () => {
    const a = venue({ venueId: 'v1', venueName: 'light2', practitioners: [jenny] });
    const b = venue({
      venueId: 'v2',
      venueName: 'light3',
      practitioners: [practitioner({ id: 'p9', name: 'jenny' }), sam],
    });
    expect(linkedSwitcherEntries([a, b], ['Sam']).map((e) => e.label)).toEqual([
      'Jenny · light2',
      'jenny · light3',
      'Sam · light3',
    ]);
  });

  it('keeps one whole-venue chip for a partner that lists no calendars', () => {
    const v = venue({ venueName: 'light2', practitioners: [], bookings: [booking()] });
    const entries = linkedSwitcherEntries([v], []);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ key: 'linked:v1', label: 'light2', practitionerId: null });
    expect(linkedSwitcherEntryCount(entries[0]!, DATE)).toBe(1);
  });
});

describe('narrowLinkedVenueToCalendar', () => {
  it("keeps only the calendar's practitioner, bookings and blocks", () => {
    const v = venue({
      practitioners: [practitioner({ id: 'p1', name: 'Jenny' }), practitioner({ id: 'p2', name: 'Sam' })],
      bookings: [booking({ id: 'b1', practitionerId: 'p1' }), booking({ id: 'b2', practitionerId: 'p2' })],
      scheduleBlocks: [
        scheduleDto({ id: 's1', calendar_id: 'p1' }),
        scheduleDto({ id: 's2', calendar_id: 'p2' }),
        scheduleDto({ id: 's3', calendar_id: null }),
      ],
    });
    const narrowed = narrowLinkedVenueToCalendar(v, 'p1');
    expect(narrowed.practitioners.map((p) => p.id)).toEqual(['p1']);
    expect(narrowed.bookings.map((b) => b.id)).toEqual(['b1']);
    expect((narrowed.scheduleBlocks ?? []).map((b) => b.id)).toEqual(['s1']);
    expect(narrowed.venueName).toBe(v.venueName);
    expect(narrowed.action).toBe(v.action);
  });
});

describe('linkedDayHeading', () => {
  const light2 = venue({ venueName: 'light2' });

  it("names the calendar, the venue under it, when the day has one calendar column", () => {
    expect(linkedDayHeading(light2, [{ practitionerId: 'p1', name: 'Jenny' }])).toEqual({
      title: 'Jenny',
      caption: 'light2',
    });
  });

  it('drops the venue caption when the calendar is named after the venue', () => {
    const light3 = venue({ venueName: 'light 3' });
    expect(linkedDayHeading(light3, [{ practitionerId: 'p1', name: 'Light 3 ' }])).toEqual({
      title: 'Light 3 ',
    });
    expect(
      linkedWeekHeading(
        venue({ venueName: 'light 3', practitioners: [practitioner({ id: 'p1', name: 'light 3' })] }),
      ),
    ).toEqual({ title: 'light 3' });
  });

  it('names the venue over several columns, and over the venue-level column alone', () => {
    expect(
      linkedDayHeading(light2, [
        { practitionerId: 'p1', name: 'Jenny' },
        { practitionerId: 'p2', name: 'Sam' },
      ]),
    ).toEqual({ title: 'light2' });
    expect(linkedDayHeading(light2, [{ practitionerId: null, name: 'light2' }])).toEqual({
      title: 'light2',
    });
  });
});
