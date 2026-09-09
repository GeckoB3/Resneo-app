import type { VisitEditService } from '@/lib/booking/appointment-visit';
import { visitRestoreRequest, visitScheduleRequest } from '@/lib/booking/visit-schedule-request';

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
});
