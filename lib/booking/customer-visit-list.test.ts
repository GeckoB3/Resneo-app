/**
 * G4: the customer's bookings list shows one card per visit (web split-visit plan 6.8).
 *
 * Seen live: a two-service visit showed as two identical lines ("Fri 27, Aura Hair Studio, 13:45")
 * with no service names. These pin the grouping the Bookings tab renders from.
 */
import {
  customerVisitServiceLine,
  customerVisitSpan,
  groupCustomerBookings,
  servicesCountLabel,
  visitActionBookingId,
} from '@/lib/booking/customer-visit-list';
import type { CustomerBooking } from '@/lib/queries/useCustomerHome';

function row(id: string, overrides: Partial<CustomerBooking> = {}): CustomerBooking {
  return {
    id,
    venue_id: 'v-1',
    booking_date: '2026-11-27',
    booking_time: '13:45:00',
    booking_end_time: '14:15:00',
    status: 'Booked',
    booking_model: 'unified_scheduling',
    visit_key: null,
    visit_service_count: 1,
    service_name: null,
    person_name: null,
    ...overrides,
  };
}

const colour = row('b-colour', {
  visit_key: 'visit-1',
  visit_service_count: 2,
  booking_time: '13:00:00',
  booking_end_time: '14:30:00',
  service_name: 'Colour',
  person_name: 'Aisha',
});
const cut = row('b-cut', {
  visit_key: 'visit-1',
  visit_service_count: 2,
  booking_time: '13:45:00',
  booking_end_time: '14:15:00',
  service_name: 'Cut',
  person_name: 'Steph',
});

describe('groupCustomerBookings', () => {
  it('lists a two-service visit as one item, opened at its earliest service', () => {
    const items = groupCustomerBookings([colour, cut]);
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item!.kind).toBe('visit');
    if (item!.kind !== 'visit') return;
    expect(item.visitKey).toBe('visit-1');
    expect(item.first.id).toBe('b-colour');
    expect(item.rows.map((r) => r.id)).toEqual(['b-colour', 'b-cut']);
  });

  it('keeps every row that is not part of a visit exactly as it was, in order', () => {
    const before = row('b-before', { booking_date: '2026-11-20' });
    const after = row('b-after', { booking_date: '2026-12-01' });
    const items = groupCustomerBookings([before, colour, cut, after]);
    expect(items.map((i) => (i.kind === 'single' ? i.booking.id : `visit:${i.visitKey}`))).toEqual([
      'b-before',
      'visit:visit-1',
      'b-after',
    ]);
    expect(items[0]).toEqual({ kind: 'single', booking: before });
  });

  it('treats a visit key with only one listed row as a booking on its own', () => {
    const lone = row('b-lone', { visit_key: 'visit-2' });
    expect(groupCustomerBookings([lone])).toEqual([{ kind: 'single', booking: lone }]);
  });

  it('places the visit where its first row falls, whatever order the list is in', () => {
    // The Past filter sorts newest first, so the later service comes first.
    const earlier = row('b-earlier', { booking_date: '2026-11-01' });
    const items = groupCustomerBookings([cut, colour, earlier]);
    expect(items.map((i) => i.kind)).toEqual(['visit', 'single']);
    const visit = items[0]!;
    if (visit.kind !== 'visit') throw new Error('expected a visit');
    // Still opened at, and listed from, the earliest service.
    expect(visit.first.id).toBe('b-colour');
    expect(visit.rows.map((r) => r.id)).toEqual(['b-colour', 'b-cut']);
  });

  it('opens a visit at its earliest LIVE service when an earlier one was cancelled', () => {
    const cancelledColour = { ...colour, status: 'Cancelled' };
    const [item] = groupCustomerBookings([cancelledColour, cut]);
    if (item!.kind !== 'visit') throw new Error('expected a visit');
    expect(item.first.id).toBe('b-cut');
    expect(item.rows).toHaveLength(2);
  });

  it('keeps two different visits apart', () => {
    const other = row('b-other', { visit_key: 'visit-3', booking_date: '2026-12-05' });
    const other2 = row('b-other2', { visit_key: 'visit-3', booking_date: '2026-12-05', booking_time: '15:00:00' });
    const items = groupCustomerBookings([colour, cut, other, other2]);
    expect(items.map((i) => (i.kind === 'visit' ? i.visitKey : null))).toEqual(['visit-1', 'visit-3']);
  });
});

describe('visitActionBookingId', () => {
  const services = [
    { booking_id: 'b-colour', status: 'Cancelled', venue_id: 'v-1' },
    { booking_id: 'b-nails', status: 'Booked', venue_id: 'v-2' },
    { booking_id: 'b-cut', status: 'Booked', venue_id: 'v-1' },
  ];
  const visit = { lead_booking_id: 'b-nails', services };

  it('acts through the opened service while it is live', () => {
    expect(visitActionBookingId(visit, 'b-cut')).toBe('b-cut');
  });

  it('acts through a live service at the same business when the opened one is cancelled', () => {
    // The server refuses cancel and confirm through a cancelled service (ALREADY_CANCELLED).
    expect(visitActionBookingId(visit, 'b-colour')).toBe('b-cut');
  });

  it('falls back to the lead when nothing at that business is live', () => {
    const onlyOther = { lead_booking_id: 'b-nails', services: services.filter((s) => s.booking_id !== 'b-cut') };
    expect(visitActionBookingId(onlyOther, 'b-colour')).toBe('b-nails');
  });
});

describe('what a visit card says', () => {
  it('spans from the first start to the latest end, not the end of the last service to start', () => {
    // G14: a long colour can run past a short cut inside it.
    expect(customerVisitSpan([colour, cut])).toEqual({ date: '2026-11-27', start: '13:00', end: '14:30' });
  });

  it('leaves a cancelled service out of the span', () => {
    expect(customerVisitSpan([{ ...colour, status: 'Cancelled' }, cut])).toEqual({
      date: '2026-11-27',
      start: '13:45',
      end: '14:15',
    });
  });

  it('names each service with its time and person, and marks a cancelled one, whatever the case of the status', () => {
    expect(customerVisitServiceLine(colour)).toBe('13:00 Colour with Aisha');
    expect(customerVisitServiceLine({ ...cut, status: 'CANCELLED' })).toBe('13:45 Cut with Steph (cancelled)');
    expect(customerVisitServiceLine({ ...cut, status: 'No-Show' })).toBe('13:45 Cut with Steph (missed)');
    expect(customerVisitServiceLine(row('x'))).toBe('13:45 Appointment');
  });

  it('counts services in plain words', () => {
    expect(servicesCountLabel(1)).toBe('1 service');
    expect(servicesCountLabel(3)).toBe('3 services');
  });
});
