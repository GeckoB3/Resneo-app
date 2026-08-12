import {
  isServiceVisit,
  minimumVisitFloorMinutes,
  resolveAppointmentVisit,
  scheduledVisitRows,
  visitServiceNames,
  type VisitServiceRow,
} from '@/lib/booking/appointment-visit';

function row(over: Partial<VisitServiceRow> & { id: string }): VisitServiceRow {
  return {
    booking_time: '10:00:00',
    booking_end_time: '11:00:00',
    status: 'Booked',
    group_booking_id: 'g1',
    ...over,
  };
}

/** The reference visit from web's plan: Fri 14 Aug, three services, one hole. */
const REFERENCE_VISIT: VisitServiceRow[] = [
  row({ id: 'a', booking_time: '10:00', booking_end_time: '11:00', booking_item_name: 'Cut & Blow Dry' }),
  row({ id: 'b', booking_time: '11:00', booking_end_time: '11:30', booking_item_name: 'Olaplex Treatment' }),
  row({ id: 'c', booking_time: '11:45', booking_end_time: '12:15', booking_item_name: 'Toner / Gloss' }),
];

describe('resolveAppointmentVisit', () => {
  it('reports the whole visit span, not the first service', () => {
    const visit = resolveAppointmentVisit(REFERENCE_VISIT)!;
    expect(visit.startHm).toBe('10:00');
    expect(visit.endHm).toBe('12:15');
    expect(visit.totalMinutes).toBe(135);
  });

  it('separates the wall-clock span from the sum of the services', () => {
    // 60 + 30 + 30 = 120 of service inside a 135-minute span. The 15-minute
    // difference is the hole a per-service edit left behind, and the two numbers
    // must not be used interchangeably.
    const visit = resolveAppointmentVisit(REFERENCE_VISIT)!;
    expect(visit.serviceMinutes).toBe(120);
    expect(visit.totalMinutes - visit.serviceMinutes).toBe(15);
  });

  it('orders services by start time however the rows arrive', () => {
    const visit = resolveAppointmentVisit([...REFERENCE_VISIT].reverse())!;
    expect(visit.services.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(visit.services.map((s) => s.gapAfterMinutes)).toEqual([0, 15, 0]);
  });

  it('refuses a party — several people, not several services', () => {
    const party = [
      row({ id: 'p1', person_label: 'Person 1' }),
      row({ id: 'p2', person_label: 'Person 2' }),
    ];
    expect(isServiceVisit(party)).toBe(false);
    expect(resolveAppointmentVisit(party)).toBeNull();
  });

  it('refuses a party even when only one row carries the label', () => {
    expect(
      resolveAppointmentVisit([row({ id: 'p1', person_label: 'Guest 1' }), row({ id: 'p2' })]),
    ).toBeNull();
  });

  it('drops cancelled and no-show rows before measuring the span', () => {
    const visit = resolveAppointmentVisit([
      ...REFERENCE_VISIT,
      row({ id: 'd', booking_time: '12:15', booking_end_time: '13:15', status: 'Cancelled' }),
    ])!;
    // The cancelled service must not stretch the visit to 13:15.
    expect(visit.endHm).toBe('12:15');
    expect(visit.services).toHaveLength(3);
  });

  it('is not a visit once cancellations leave fewer than two services', () => {
    expect(
      resolveAppointmentVisit([
        row({ id: 'a' }),
        row({ id: 'b', booking_time: '11:00', status: 'Cancelled' }),
      ]),
    ).toBeNull();
  });

  it('is not a visit for a single row, an empty set, or mixed groups', () => {
    expect(resolveAppointmentVisit([])).toBeNull();
    expect(resolveAppointmentVisit([row({ id: 'a' })])).toBeNull();
    expect(
      resolveAppointmentVisit([row({ id: 'a' }), row({ id: 'b', group_booking_id: 'g2' })]),
    ).toBeNull();
  });

  it('refuses rows it cannot place rather than guessing a start', () => {
    expect(
      resolveAppointmentVisit([row({ id: 'a' }), row({ id: 'b', booking_time: null })]),
    ).toBeNull();
  });

  it('falls back to the add-on minutes when a row carries no end time', () => {
    const visit = resolveAppointmentVisit([
      row({ id: 'a', booking_time: '10:00', booking_end_time: null, addons_total_duration_minutes: 20 }),
      row({ id: 'b', booking_time: '10:20', booking_end_time: '10:50' }),
    ])!;
    expect(visit.services[0]!.endHm).toBe('10:20');
    expect(visit.totalMinutes).toBe(50);
  });

  it('wraps past midnight instead of clamping to 23:59', () => {
    // `minutesToTime` in grid-layout clamps, which would report this visit as
    // ending at 23:59 — missing information replaced by wrong information.
    const visit = resolveAppointmentVisit([
      row({ id: 'a', booking_time: '23:00', booking_end_time: '23:30' }),
      row({ id: 'b', booking_time: '23:30', booking_end_time: '00:15' }),
    ])!;
    expect(visit.endHm).toBe('00:15');
    expect(visit.totalMinutes).toBe(75);
  });

  it('names every service, falling back for an unnamed row', () => {
    const visit = resolveAppointmentVisit([
      row({ id: 'a', booking_item_name: 'Cut' }),
      row({ id: 'b', booking_time: '11:00', booking_item_name: null }),
    ])!;
    expect(visitServiceNames(visit)).toEqual(['Cut', 'Service']);
  });
});

describe('scheduledVisitRows', () => {
  it('keeps only the statuses that put a service on the calendar', () => {
    const rows = ['Pending', 'Booked', 'Confirmed', 'Seated', 'Cancelled', 'No-Show', 'Completed'].map(
      (status, i) => row({ id: `s${i}`, status }),
    );
    expect(scheduledVisitRows(rows).map((r) => r.status)).toEqual([
      'Pending',
      'Booked',
      'Confirmed',
      'Seated',
    ]);
  });
});

describe('minimumVisitFloorMinutes', () => {
  it('stays below the server floor so no valid length is out of reach', () => {
    // The server adds each service's configured buffer on top of this. Clamping
    // any higher here would make a legitimate shorter visit unreachable.
    expect(minimumVisitFloorMinutes(3)).toBe(15);
    expect(minimumVisitFloorMinutes(1)).toBe(5);
    expect(minimumVisitFloorMinutes(0)).toBe(5);
  });
});
