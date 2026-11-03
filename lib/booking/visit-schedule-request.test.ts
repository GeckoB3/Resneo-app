import type { VisitEditService } from '@/lib/booking/appointment-visit';
import {
  defaultAddedServiceCalendar,
  isMultiCalendarVisit,
  visitRestoreRequest,
  visitScheduleRequest,
  visitServiceLinesRequest,
} from '@/lib/booking/visit-schedule-request';

/** Cut 14:00–14:45, colour 14:45–15:45, toner 16:00–16:15 (a 15-minute wait before it). */
const ROWS: VisitEditService[] = [
  { bookingId: 'bk-lead', startHm: '14:00', durationMinutes: 45 },
  { bookingId: 'bk-1', startHm: '14:45', durationMinutes: 60 },
  { bookingId: 'bk-3', startHm: '16:00', durationMinutes: 15 },
];

describe('visitScheduleRequest', () => {
  it('is a shift when only the slot changes', () => {
    expect(
      visitScheduleRequest({
        services: ROWS,
        fromDate: '2026-08-10',
        fromTime: '14:00',
        toDate: '2026-08-11',
        toTime: '09:30:00',
        fromTotalMinutes: 135,
        toTotalMinutes: 135,
      }),
    ).toEqual({ shift: { booking_date: '2026-08-11', booking_time: '09:30:00' } });
  });

  it('carries a chosen calendar on the shift, and only then', () => {
    expect(
      visitScheduleRequest({
        services: ROWS,
        fromDate: '2026-08-10',
        fromTime: '14:00',
        toDate: '2026-08-10',
        toTime: '14:00',
        practitionerId: 'prac-2',
      }).shift,
    ).toEqual({ booking_date: '2026-08-10', booking_time: '14:00:00', practitioner_id: 'prac-2' });
  });

  it('puts extra length on the last service and names every row', () => {
    const body = visitScheduleRequest({
      services: ROWS,
      fromDate: '2026-08-10',
      fromTime: '14:00',
      toDate: '2026-08-10',
      toTime: '14:00',
      fromTotalMinutes: 135,
      toTotalMinutes: 150,
    });
    expect(body.shift).toBeUndefined();
    expect(body.known_booking_ids).toEqual(['bk-lead', 'bk-1', 'bk-3']);
    expect(body.services).toEqual([
      { booking_id: 'bk-lead', booking_date: '2026-08-10', booking_time: '14:00:00' },
      { booking_id: 'bk-1', booking_date: '2026-08-10', booking_time: '14:45:00' },
      { booking_id: 'bk-3', booking_date: '2026-08-10', booking_time: '16:00:00', duration_minutes: 30 },
    ]);
  });

  it('takes a shrink off the last service, never below its floor', () => {
    const body = visitScheduleRequest({
      services: ROWS,
      fromDate: '2026-08-10',
      fromTime: '14:00',
      toDate: '2026-08-10',
      toTime: '14:00',
      fromTotalMinutes: 135,
      toTotalMinutes: 100,
    });
    expect(body.services?.[2]).toEqual(
      expect.objectContaining({ booking_id: 'bk-3', duration_minutes: 5 }),
    );
  });

  it('shifts every row by the move when a length change rides with it', () => {
    const body = visitScheduleRequest({
      services: ROWS,
      fromDate: '2026-08-10',
      fromTime: '14:00:00',
      toDate: '2026-08-11',
      toTime: '09:30',
      practitionerId: 'prac-2',
      fromTotalMinutes: 135,
      toTotalMinutes: 145,
    });
    expect(body.services).toEqual([
      { booking_id: 'bk-lead', booking_date: '2026-08-11', booking_time: '09:30:00', practitioner_id: 'prac-2' },
      { booking_id: 'bk-1', booking_date: '2026-08-11', booking_time: '10:15:00', practitioner_id: 'prac-2' },
      {
        booking_id: 'bk-3',
        booking_date: '2026-08-11',
        booking_time: '11:30:00',
        practitioner_id: 'prac-2',
        duration_minutes: 25,
      },
    ]);
  });
});

describe('a visit over several days', () => {
  const CROSS_DAY: VisitEditService[] = [
    { bookingId: 'bk-lead', date: '2026-08-10', startHm: '14:00', durationMinutes: 45 },
    { bookingId: 'bk-2', date: '2026-08-11', startHm: '09:00', durationMinutes: 60 },
  ];

  it('keeps each row on its own day when the visit moves a day later with a length change', () => {
    const body = visitScheduleRequest({
      services: CROSS_DAY,
      fromDate: '2026-08-10',
      fromTime: '14:00',
      toDate: '2026-08-11',
      toTime: '14:30',
      fromTotalMinutes: 1200,
      toTotalMinutes: 1215,
    });
    expect(body.services).toEqual([
      { booking_id: 'bk-lead', booking_date: '2026-08-11', booking_time: '14:30:00' },
      { booking_id: 'bk-2', booking_date: '2026-08-12', booking_time: '09:30:00', duration_minutes: 75 },
    ]);
  });

  it('names only what a one-day caller can see, without the known-rows guard', () => {
    const body = visitScheduleRequest({
      services: [CROSS_DAY[0]!],
      fromDate: '2026-08-10',
      fromTime: '14:00',
      toDate: '2026-08-10',
      toTime: '15:00',
      mode: 'services',
      guardKnownRows: false,
    });
    expect(body.shift).toBeUndefined();
    expect(body.known_booking_ids).toBeUndefined();
    expect(body.services).toEqual([
      { booking_id: 'bk-lead', booking_date: '2026-08-10', booking_time: '15:00:00' },
    ]);
  });

  it('restores each row to its own day', () => {
    expect(visitRestoreRequest({ services: CROSS_DAY, date: '2026-08-10' }).services!.map((s) => s.booking_date)).toEqual([
      '2026-08-10',
      '2026-08-11',
    ]);
  });
});

describe('visitRestoreRequest', () => {
  it('names every row with the slot and length it had', () => {
    expect(visitRestoreRequest({ services: ROWS, date: '2026-08-10', practitionerId: 'prac-1' })).toEqual({
      services: [
        { booking_id: 'bk-lead', booking_date: '2026-08-10', booking_time: '14:00:00', practitioner_id: 'prac-1', duration_minutes: 45 },
        { booking_id: 'bk-1', booking_date: '2026-08-10', booking_time: '14:45:00', practitioner_id: 'prac-1', duration_minutes: 60 },
        { booking_id: 'bk-3', booking_date: '2026-08-10', booking_time: '16:00:00', practitioner_id: 'prac-1', duration_minutes: 15 },
      ],
      known_booking_ids: ['bk-lead', 'bk-1', 'bk-3'],
    });
  });

  it('puts each row back on its own calendar (split-visit plan G12)', () => {
    // A cut with Aisha and a manicure with Steph: an Undo opened from the cut
    // must not move the manicure onto Aisha's calendar.
    const twoPeople: VisitEditService[] = [
      { bookingId: 'cut', date: '2026-08-10', calendarId: 'aisha', startHm: '10:00', durationMinutes: 45 },
      { bookingId: 'mani', date: '2026-08-10', calendarId: 'steph', startHm: '10:15', durationMinutes: 30 },
    ];
    const body = visitRestoreRequest({ services: twoPeople, date: '2026-08-10', practitionerId: 'aisha' });
    expect(body.services!.map((s) => [s.booking_id, s.practitioner_id])).toEqual([
      ['cut', 'aisha'],
      ['mani', 'steph'],
    ]);
  });

  it('names no calendar for a row with none and no fallback', () => {
    const body = visitRestoreRequest({ services: [ROWS[0]!], date: '2026-08-10' });
    expect(body.services![0]).not.toHaveProperty('practitioner_id');
  });
});

describe('visitServiceEditsRequest', () => {
  const { visitServiceEditsRequest } = require('@/lib/booking/visit-schedule-request');
  const baseline = {
    'bk-lead': { date: '2026-08-10', time: '14:00', calendarId: 'prac-1', durationMinutes: 45 },
    'bk-1': { date: '2026-08-10', time: '14:45', calendarId: 'prac-1', durationMinutes: 60 },
  };

  it('names only the services whose edit differs, with everything asked for', () => {
    const body = visitServiceEditsRequest({
      rowIds: ['bk-lead', 'bk-1'],
      edits: {
        ...baseline,
        'bk-1': { date: '2026-08-11', time: '09:30', calendarId: 'prac-2', durationMinutes: 30 },
      },
      baseline,
    });
    expect(body).toEqual({
      services: [
        {
          booking_id: 'bk-1',
          booking_date: '2026-08-11',
          booking_time: '09:30:00',
          practitioner_id: 'prac-2',
          duration_minutes: 30,
        },
      ],
      known_booking_ids: ['bk-lead', 'bk-1'],
    });
  });

  it('names nothing when nothing changed', () => {
    expect(
      visitServiceEditsRequest({ rowIds: ['bk-lead', 'bk-1'], edits: baseline, baseline }).services,
    ).toEqual([]);
  });
});

describe('a visit with more than one person (split-visit plan G11, G12)', () => {
  const rowCalendars: Record<string, string> = { cut: 'aisha', mani: 'steph' };
  const rowCalendarId = (id: string) => rowCalendars[id] ?? null;

  it('knows a visit with more than one person', () => {
    expect(
      isMultiCalendarVisit(
        [
          { calendarId: 'aisha' },
          { calendarId: 'steph' },
        ],
        'aisha',
      ),
    ).toBe(true);
    expect(isMultiCalendarVisit([{ calendarId: 'aisha' }, { calendarId: null }], 'aisha')).toBe(false);
    expect(isMultiCalendarVisit([{ calendarId: 'steph' }], 'aisha')).toBe(false);
  });

  it('names each kept service with its own calendar, and an added one with its own', () => {
    const lines = visitServiceLinesRequest({
      lines: [
        { bookingId: 'cut', serviceId: 's-cut', variantId: null },
        { bookingId: 'mani', serviceId: 's-mani', variantId: 'v-1' },
        { bookingId: null, serviceId: 's-brow', variantId: null, calendarId: 'bea' },
      ],
      multiCalendar: true,
      rowCalendarId,
      visitCalendarId: 'aisha',
    });
    expect(lines).toEqual([
      { booking_id: 'cut', service_id: 's-cut', service_variant_id: null, calendar_id: 'aisha' },
      { booking_id: 'mani', service_id: 's-mani', service_variant_id: 'v-1', calendar_id: 'steph' },
      { service_id: 's-brow', service_variant_id: null, calendar_id: 'bea' },
    ]);
  });

  it('keeps a one-person visit on the visit calendar', () => {
    const lines = visitServiceLinesRequest({
      lines: [
        { bookingId: 'cut', serviceId: 's-cut', variantId: null },
        { bookingId: null, serviceId: 's-brow', variantId: null },
      ],
      multiCalendar: false,
      rowCalendarId,
      visitCalendarId: 'carla',
    });
    expect(lines.map((l) => l.calendar_id)).toEqual(['carla', 'carla']);
  });

  it('starts an added service with the person before it, when they offer it', () => {
    const offers = (cal: string, svc: string) =>
      (cal === 'steph' && svc === 's-brow') || (cal === 'bea' && svc === 's-wax');
    const args = {
      lines: [
        { bookingId: 'cut', serviceId: 's-cut', variantId: null },
        { bookingId: 'mani', serviceId: 's-mani', variantId: null },
      ],
      rowCalendarId,
      visitCalendarId: 'aisha',
      offers,
      offeringCalendars: (svc: string) => (svc === 's-wax' ? ['bea'] : []),
    };
    expect(defaultAddedServiceCalendar({ ...args, serviceId: 's-brow' })).toBe('steph');
    // Nobody before offers it: the first person who does.
    expect(defaultAddedServiceCalendar({ ...args, serviceId: 's-wax' })).toBe('bea');
    // Nobody offers it at all: the person before, and the server says why not.
    expect(defaultAddedServiceCalendar({ ...args, serviceId: 's-none' })).toBe('steph');
  });
});
