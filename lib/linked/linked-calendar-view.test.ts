import {
  fmtTime,
  linkedActionLabel,
  linkedBookingLabel,
  linkedBusyBlock,
  linkedGridBooking,
  linkedHasTemplate,
  linkedOpenRanges,
  linkedScheduleBlocksForDate,
  linkedVenueDayHours,
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
