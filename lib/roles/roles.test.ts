/**
 * The four roles in the app (web roles plan Part A1): which role someone has, who holds "Billing,
 * payouts and admins", what a viewer may do on a member's row, and the server's words for the
 * roles refusals.
 */
import { ApiError } from '@/lib/api/client';
import {
  billingSwitchOn,
  hasBillingPayoutsAdmins,
  memberAccess,
  ROLES_COPY,
  roleChoiceBody,
  roleChoiceOf,
  roleKeyOf,
  roleLabelOf,
  roleOptionsFor,
  rolesT,
  showsBillingSwitch,
  teamErrorMessage,
  teamViewerOf,
  venueBillingPayoutsAdmins,
  type TeamViewer,
} from '@/lib/roles/roles';

const EM_DASH = String.fromCharCode(0x2014);

const OWNER: TeamViewer = { staffId: 'owner', isOwner: true, billingPayoutsAdmins: true, rolesKnown: true };
const ADMIN_WITH: TeamViewer = { staffId: 'a1', isOwner: false, billingPayoutsAdmins: true, rolesKnown: true };
const ADMIN_WITHOUT: TeamViewer = { staffId: 'a2', isOwner: false, billingPayoutsAdmins: false, rolesKnown: true };

describe('roleKeyOf', () => {
  it("takes the server's role_key when it sends one", () => {
    expect(roleKeyOf({ role: 'staff', role_key: 'front_desk' })).toBe('front_desk');
    expect(roleKeyOf({ role: 'admin', role_key: 'owner' })).toBe('owner');
  });

  it('works the role out from the row when the server sends no key', () => {
    expect(roleKeyOf({ role: 'admin', is_owner: true })).toBe('owner');
    expect(roleKeyOf({ role: 'admin' })).toBe('admin');
    expect(roleKeyOf({ role: 'staff', permissions: { role_key: 'front_desk' } })).toBe('front_desk');
    expect(roleKeyOf({ role: 'staff' })).toBe('staff');
    expect(roleKeyOf(null)).toBe('staff');
  });

  it('names the roles as the web does, and the picker reads the owner as an admin', () => {
    expect(roleLabelOf({ role: 'admin', is_owner: true })).toBe('Owner');
    expect(roleLabelOf({ role: 'staff', role_key: 'front_desk' })).toBe('Front desk');
    expect(roleChoiceOf({ role: 'admin', is_owner: true })).toBe('admin');
    expect(roleChoiceOf({ role: 'staff', role_key: 'front_desk' })).toBe('front_desk');
  });
});

describe('the billing switch', () => {
  it('is the owner, or an admin whose switch is on or absent (UR22)', () => {
    expect(hasBillingPayoutsAdmins({ role: 'admin', is_owner: true, permissions: { billing_payouts_admins: false } })).toBe(true);
    expect(hasBillingPayoutsAdmins({ role: 'admin' })).toBe(true);
    expect(hasBillingPayoutsAdmins({ role: 'admin', permissions: { billing_payouts_admins: true } })).toBe(true);
    expect(hasBillingPayoutsAdmins({ role: 'admin', permissions: { billing_payouts_admins: false } })).toBe(false);
    expect(hasBillingPayoutsAdmins({ role: 'staff', role_key: 'front_desk' })).toBe(false);
    expect(hasBillingPayoutsAdmins(null)).toBe(false);
  });

  it("reads the venue payload's own answer first, else the role fields, else every admin (an older server)", () => {
    expect(venueBillingPayoutsAdmins({ current_user_role: 'admin', current_user_billing_payouts_admins: false })).toBe(false);
    expect(venueBillingPayoutsAdmins({ current_user_role: 'admin', current_user_billing_payouts_admins: true })).toBe(true);
    expect(
      venueBillingPayoutsAdmins({ current_user_role: 'admin', current_user_permissions: { billing_payouts_admins: false } }),
    ).toBe(false);
    expect(venueBillingPayoutsAdmins({ current_user_role: 'admin' })).toBe(true);
    expect(venueBillingPayoutsAdmins({ current_user_role: 'staff' })).toBe(false);
    expect(venueBillingPayoutsAdmins(null)).toBe(false);
  });

  it('reads absent as on for an admin row', () => {
    expect(billingSwitchOn({ role: 'admin' })).toBe(true);
    expect(billingSwitchOn({ role: 'admin', permissions: { billing_payouts_admins: false } })).toBe(false);
  });
});

describe('the Team screen viewer', () => {
  it('comes from staff/me, and knows the four roles only when the server sent role_key', () => {
    expect(teamViewerOf({ id: 's1', role: 'admin', is_owner: true, role_key: 'owner', permissions: {} })).toEqual({
      staffId: 's1',
      isOwner: true,
      billingPayoutsAdmins: true,
      rolesKnown: true,
    });
    expect(teamViewerOf({ id: 's2', role: 'admin' })).toEqual({
      staffId: 's2',
      isOwner: false,
      billingPayoutsAdmins: true,
      rolesKnown: false,
    });
  });

  it("protects the owner's row from everyone else, and other admins from an admin without the switch", () => {
    const owner = { id: 'owner', role: 'admin', is_owner: true };
    const admin = { id: 'a9', role: 'admin' };
    const desk = { id: 'f1', role: 'staff', role_key: 'front_desk' };
    expect(memberAccess(ADMIN_WITH, owner)).toBe('owner_protected');
    expect(memberAccess(OWNER, owner)).toBe('self');
    expect(memberAccess(ADMIN_WITHOUT, admin)).toBe('billing_locked');
    expect(memberAccess(ADMIN_WITH, admin)).toBe('manage');
    expect(memberAccess(ADMIN_WITHOUT, desk)).toBe('manage');
    // Nobody manages their own row (web MemberCard): the owner or another admin does.
    expect(memberAccess(ADMIN_WITHOUT, { id: 'a2', role: 'admin' })).toBe('self');
  });

  it('offers Front desk on a server that knows it, and Admin only with the switch', () => {
    expect(roleOptionsFor(OWNER).map((o) => o.value)).toEqual(['staff', 'front_desk', 'admin']);
    expect(roleOptionsFor(ADMIN_WITHOUT).map((o) => o.value)).toEqual(['staff', 'front_desk']);
    expect(roleOptionsFor({ ...ADMIN_WITH, rolesKnown: false }).map((o) => o.value)).toEqual(['staff', 'admin']);
  });

  it('shows "Billing, payouts and admins" to the owner, on other admins only', () => {
    expect(showsBillingSwitch(OWNER, { id: 'a9', role: 'admin' })).toBe(true);
    expect(showsBillingSwitch(OWNER, { id: 'owner', role: 'admin', is_owner: true })).toBe(false);
    expect(showsBillingSwitch(OWNER, { id: 'f1', role: 'staff' })).toBe(false);
    expect(showsBillingSwitch(ADMIN_WITH, { id: 'a9', role: 'admin' })).toBe(false);
  });

  it('sends role_key with role, so an older server still gets the stored role', () => {
    expect(roleChoiceBody('front_desk')).toEqual({ role: 'staff', role_key: 'front_desk' });
    expect(roleChoiceBody('admin')).toEqual({ role: 'admin', role_key: 'admin' });
    expect(roleChoiceBody('staff')).toEqual({ role: 'staff', role_key: 'staff' });
  });
});

describe('teamErrorMessage', () => {
  const refusal = (status: number, body: unknown) => new ApiError('generic', status, body);

  it("shows the server's own words for the roles refusals and the invite limit", () => {
    expect(
      teamErrorMessage(refusal(403, { error: "You can't change or remove the owner.", code: 'OWNER_PROTECTED' }), 'x'),
    ).toBe("You can't change or remove the owner.");
    expect(
      teamErrorMessage(refusal(403, { error: 'Only the owner can change Billing, payouts and admins.', code: 'PERMISSION_NOT_ALLOWED' }), 'x'),
    ).toBe('Only the owner can change Billing, payouts and admins.');
    expect(
      teamErrorMessage(
        refusal(429, { error: "You've sent a lot of invites today. Please try again tomorrow.", code: 'RATE_LIMITED', retry_after_seconds: 60 }),
        'x',
      ),
    ).toBe("You've sent a lot of invites today. Please try again tomorrow.");
  });

  it("falls back to the copy deck's words when a refusal carries no sentence", () => {
    expect(teamErrorMessage(refusal(403, { error: '', code: 'BILLING_ADMINS_ONLY' }), 'x')).toBe(ROLES_COPY['billing.only']);
  });

  it('uses the error message, or the fallback for anything that is not an API error', () => {
    expect(teamErrorMessage(new ApiError('Request failed (500)', 500), 'x')).toBe('Request failed (500)');
    expect(teamErrorMessage(new Error('boom'), 'Could not save.')).toBe('Could not save.');
  });
});

describe('the roles copy', () => {
  it('has no em-dash, and fills the owner name', () => {
    for (const [id, text] of Object.entries(ROLES_COPY)) {
      expect({ id, dash: text.includes(EM_DASH) }).toEqual({ id, dash: false });
    }
    expect(rolesT('owner.protected', { owner: 'Ana' })).toBe(
      'Only Ana can change this. The owner can transfer ownership from their own row.',
    );
    expect(ROLES_COPY['owner.transfer']).toBe('Transfer ownership from your ResNeo dashboard on the web.');
  });
});
