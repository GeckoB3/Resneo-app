import {
  canChangeVisitServiceStatus,
  linkedContextFromBooking,
  LINKED_LIMITED_EDIT_BANNER,
  LINKED_VIEW_ONLY_BANNER,
  linkedDetailPolicy,
} from '@/lib/linked/linked-detail-policy';

describe('linkedDetailPolicy', () => {
  it('leaves an own booking unrestricted, with no banner', () => {
    expect(linkedDetailPolicy(null)).toEqual({
      linked: false,
      viewOnly: false,
      limitedEdit: false,
      canEdit: true,
      canCancel: true,
      canRebook: true,
      showContactsLink: true,
      banner: null,
    });
    expect(linkedDetailPolicy(undefined).linked).toBe(false);
  });

  it('makes a view-only link read only, with the web banner', () => {
    const policy = linkedDetailPolicy('none');
    expect(policy).toMatchObject({
      linked: true,
      viewOnly: true,
      limitedEdit: false,
      canEdit: false,
      canCancel: false,
      canRebook: false,
      showContactsLink: false,
    });
    expect(policy.banner).toBe(LINKED_VIEW_ONLY_BANNER);
  });

  it('lets an edit-existing link change the booking but not cancel or rebook', () => {
    const policy = linkedDetailPolicy('edit_existing');
    expect(policy).toMatchObject({
      linked: true,
      viewOnly: false,
      limitedEdit: true,
      canEdit: true,
      canCancel: false,
      canRebook: false,
      showContactsLink: false,
    });
    expect(policy.banner).toBe(LINKED_LIMITED_EDIT_BANNER);
  });

  it("gives a full grant everything but our own Contacts link, and no banner", () => {
    const policy = linkedDetailPolicy('create_edit_cancel');
    expect(policy).toMatchObject({
      linked: true,
      viewOnly: false,
      limitedEdit: false,
      canEdit: true,
      canCancel: true,
      canRebook: true,
      showContactsLink: false,
      banner: null,
    });
  });
});

/**
 * The per-service Start / Undo start / Complete / Undo complete on a visit's
 * rows. They were withheld from every partner booking while the diary's bars on
 * the partner's column offered the same actions (owner, 2026-09-12).
 */
describe('canChangeVisitServiceStatus', () => {
  it('offers them on our own visit', () => {
    expect(canChangeVisitServiceStatus(linkedDetailPolicy(null), false)).toBe(true);
  });

  it("offers them on a partner's visit when the link lets us edit it", () => {
    expect(canChangeVisitServiceStatus(linkedDetailPolicy('edit_existing'), false)).toBe(true);
    expect(canChangeVisitServiceStatus(linkedDetailPolicy('create_edit_cancel'), false)).toBe(true);
  });

  it('withholds them on a view-only link', () => {
    expect(canChangeVisitServiceStatus(linkedDetailPolicy('none'), false)).toBe(false);
  });

  it('withholds them on a table reservation, own or linked', () => {
    expect(canChangeVisitServiceStatus(linkedDetailPolicy(null), true)).toBe(false);
    expect(canChangeVisitServiceStatus(linkedDetailPolicy('create_edit_cancel'), true)).toBe(false);
  });
});

/**
 * A partner's booking opened without its link ("View booking" after booking on a collective
 * partner's calendar, 2026-11-18) takes the link from the booking itself.
 */
describe('linkedContextFromBooking', () => {
  it('builds the context from the booking for a partner booking', () => {
    expect(
      linkedContextFromBooking({ venue_id: 'v-b', venue_name: ' Aura Hair Studio (Jenny) ', act: 'create_edit_cancel', pii: true }),
    ).toEqual({ act: 'create_edit_cancel', venueId: 'v-b', venueName: 'Aura Hair Studio (Jenny)', pii: true, inCollective: false });
  });

  it('carries whether the partner is in the same collective (web 2026-11-22)', () => {
    expect(
      linkedContextFromBooking({ venue_id: 'v-b', venue_name: 'Light 16', act: 'none', pii: false, in_collective: true })?.inCollective,
    ).toBe(true);
  });

  it('is null for an own booking, an older server or an unknown grant', () => {
    expect(linkedContextFromBooking(null)).toBeNull();
    expect(linkedContextFromBooking(undefined)).toBeNull();
    expect(linkedContextFromBooking({ venue_id: 'v-b', act: 'something_else' })).toBeNull();
    expect(linkedContextFromBooking({ venue_id: '', act: 'none' })).toBeNull();
  });

  it('names an unnamed partner plainly and reads a missing pii as no', () => {
    expect(linkedContextFromBooking({ venue_id: 'v-b', venue_name: null, act: 'none' })).toEqual({
      act: 'none',
      venueId: 'v-b',
      venueName: 'Linked business',
      pii: false,
      inCollective: false,
    });
  });
});
