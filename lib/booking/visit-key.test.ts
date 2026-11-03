import { sameVisit, visitKeyOf } from '@/lib/booking/visit-key';

describe('visitKeyOf', () => {
  it('is the group id for a multi-service visit, and the link between businesses when there is one', () => {
    expect(visitKeyOf({ id: 'b1', group_booking_id: 'grp' })).toBe('grp');
    expect(visitKeyOf({ id: 'b1', group_booking_id: 'grp', linked_visit_id: 'link' })).toBe('link');
  });

  it('is null for group bookings, class carts, event, class and resource rows', () => {
    expect(visitKeyOf({ group_booking_id: 'grp', person_label: 'Guest 2' })).toBeNull();
    expect(visitKeyOf({ group_booking_id: 'cart', class_instance_id: 'ci' })).toBeNull();
    expect(visitKeyOf({ group_booking_id: 'grp', experience_event_id: 'ev' })).toBeNull();
    expect(visitKeyOf({ group_booking_id: 'grp', resource_id: 'res' })).toBeNull();
  });

  it('is null for a booking on its own, and treats a blank person label as none', () => {
    expect(visitKeyOf({ id: 'b1' })).toBeNull();
    expect(visitKeyOf({ group_booking_id: 'grp', person_label: ' ' })).toBe('grp');
  });
});

describe('sameVisit', () => {
  it('matches rows of one visit only', () => {
    expect(sameVisit({ group_booking_id: 'g' }, { group_booking_id: 'g' })).toBe(true);
    expect(sameVisit({ group_booking_id: 'g' }, { group_booking_id: 'h' })).toBe(false);
    expect(sameVisit({}, {})).toBe(false);
  });
});
