import {
  earliestStartAfterGroup,
  filterSlotsForGroup,
  groupBusyIntervals,
  pickSlotAtOrAfter,
  slotClashesWithGroup,
} from '@/lib/booking/group-slot-availability';
import type { GroupPerson } from '@/lib/booking/multi-service-chain';

/**
 * A group's attendees only exist on the client until the whole group is
 * submitted, so the server's availability engine cannot exclude them. Without
 * this arithmetic every attendee is offered the same free slots and two of them
 * can be booked onto one practitioner at one time.
 */
function person(over: Partial<GroupPerson>): GroupPerson {
  return {
    label: 'Guest 1',
    serviceId: 'svc-1',
    serviceName: 'Haircut',
    practitionerId: 'p1',
    practitionerName: 'Alex',
    bookingDate: '2026-07-27',
    bookingTime: '10:00',
    durationMinutes: 30,
    pricePence: 2500,
    ...over,
  };
}

const slot = (start: string, practitionerId = 'p1') => ({
  start_time: start,
  practitioner_id: practitionerId,
});

describe('groupBusyIntervals', () => {
  it('collects only the attendees on the date being picked', () => {
    const busy = groupBusyIntervals(
      [
        person({ bookingTime: '10:00', durationMinutes: 30 }),
        person({ bookingDate: '2026-07-28', bookingTime: '11:00' }),
      ],
      '2026-07-27',
    );
    expect(busy).toEqual([{ practitionerId: 'p1', startMinutes: 600, endMinutes: 630 }]);
  });

  it('tolerates a seconds-bearing time', () => {
    const busy = groupBusyIntervals([person({ bookingTime: '09:15:00' })], '2026-07-27');
    expect(busy[0]?.startMinutes).toBe(555);
  });
});

describe('slotClashesWithGroup', () => {
  const busy = groupBusyIntervals([person({ bookingTime: '10:00', durationMinutes: 30 })], '2026-07-27');

  it('rejects a slot starting inside an existing booking', () => {
    expect(slotClashesWithGroup(slot('10:15'), 30, busy)).toBe(true);
  });

  it('rejects a slot that RUNS INTO an existing booking', () => {
    // The candidate's own duration matters, not just its start: 09:45 + 45min
    // reaches 10:30 and collides with the 10:00 booking.
    expect(slotClashesWithGroup(slot('09:45'), 45, busy)).toBe(true);
  });

  it('allows a slot that ends exactly as the existing one starts', () => {
    expect(slotClashesWithGroup(slot('09:30'), 30, busy)).toBe(false);
  });

  it('allows a slot starting exactly when the existing one ends', () => {
    expect(slotClashesWithGroup(slot('10:30'), 30, busy)).toBe(false);
  });

  it('allows the same time on a DIFFERENT practitioner', () => {
    // Two attendees seen at once by different staff is the normal shape of a
    // group booking, not a clash.
    expect(slotClashesWithGroup(slot('10:00', 'p2'), 30, busy)).toBe(false);
  });
});

describe('filterSlotsForGroup', () => {
  it('drops the clashing slots and keeps the rest', () => {
    const busy = groupBusyIntervals([person({ bookingTime: '10:00', durationMinutes: 30 })], '2026-07-27');
    const kept = filterSlotsForGroup(
      [slot('09:30'), slot('10:00'), slot('10:15'), slot('10:30')],
      30,
      busy,
    );
    expect(kept.map((s) => s.start_time)).toEqual(['09:30', '10:30']);
  });

  it('returns the list untouched when the group has nothing booked yet', () => {
    const slots = [slot('09:00'), slot('09:30')];
    expect(filterSlotsForGroup(slots, 30, [])).toBe(slots);
  });
});

describe('earliestStartAfterGroup', () => {
  it('follows on from this practitioner’s last booking', () => {
    const busy = groupBusyIntervals(
      [
        person({ bookingTime: '10:00', durationMinutes: 30 }),
        person({ bookingTime: '11:00', durationMinutes: 45 }),
      ],
      '2026-07-27',
    );
    expect(earliestStartAfterGroup(busy, 'p1')).toBe('11:45');
  });

  it('says nothing for a practitioner with no bookings in the group', () => {
    const busy = groupBusyIntervals([person({})], '2026-07-27');
    expect(earliestStartAfterGroup(busy, 'p2')).toBeNull();
  });

  it('says nothing on "any available", where there is no one to follow', () => {
    const busy = groupBusyIntervals([person({})], '2026-07-27');
    expect(earliestStartAfterGroup(busy, null)).toBeNull();
  });
});

describe('pickSlotAtOrAfter', () => {
  it('picks the first slot at or after the threshold', () => {
    const slots = [slot('09:30'), slot('10:30'), slot('11:00')];
    expect(pickSlotAtOrAfter(slots, '10:30')?.start_time).toBe('10:30');
  });

  it('skips earlier slots entirely', () => {
    const slots = [slot('09:00'), slot('09:30'), slot('11:15')];
    expect(pickSlotAtOrAfter(slots, '10:00')?.start_time).toBe('11:15');
  });

  it('returns null when nothing qualifies, leaving the choice to staff', () => {
    expect(pickSlotAtOrAfter([slot('09:00')], '10:00')).toBeNull();
    expect(pickSlotAtOrAfter([slot('09:00')], null)).toBeNull();
  });
});
