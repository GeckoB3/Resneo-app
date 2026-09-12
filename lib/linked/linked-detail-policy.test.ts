import {
  canChangeVisitServiceStatus,
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
