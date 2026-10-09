/**
 * More tab — `buildDestinations` gating (Navigation & IA, Domain 01).
 *
 * Pure-function unit tests over a fake venue context against the light
 * `lib/navigation/more-destinations` module (no screen / react-query / netinfo
 * imports), so the gating is testable in isolation.
 *
 * Covers the web-parity gating decisions:
 *  - model links (Classes/Events/Resources) are model-driven, NOT admin-only;
 *  - the Tables row stays a web-only link-out;
 *  - "Import contacts" is admin-only and opens the in-app import wizard (/import);
 *  - Compliance = appointment tier + records flag, shown to staff AND admin;
 *  - Waitlist / Calendar-availability follow model eligibility, not role.
 */
import {
  buildDestinations,
  LIST_GROUPS,
  type DestinationsContext,
} from '@/lib/navigation/more-destinations';
import type { BookingModel } from '@/types/venue';

function ctx(overrides: Partial<DestinationsContext> = {}): DestinationsContext {
  return {
    isAdmin: false,
    enabledModels: new Set<BookingModel>(),
    pricingTier: 'appointments',
    complianceEnabled: false,
    waitlistEnabled: false,
    ...overrides,
  };
}

const ids = (c: DestinationsContext) => buildDestinations(c).map((d) => d.id);

describe('buildDestinations — model-link gating (web parity)', () => {
  it('shows Classes to NON-admin staff when class_session is enabled', () => {
    const list = ids(
      ctx({ isAdmin: false, enabledModels: new Set<BookingModel>(['class_session']) }),
    );
    expect(list).toContain('model-class_session');
  });

  it('shows Events & Resources to non-admin staff for their enabled models', () => {
    const list = ids(
      ctx({
        isAdmin: false,
        enabledModels: new Set<BookingModel>(['event_ticket', 'resource_booking']),
      }),
    );
    expect(list).toContain('model-event_ticket');
    expect(list).toContain('model-resource_booking');
  });

  it('hides model rows for models the venue has NOT enabled', () => {
    const list = ids(
      ctx({ isAdmin: true, enabledModels: new Set<BookingModel>(['class_session']) }),
    );
    expect(list).toContain('model-class_session');
    expect(list).not.toContain('model-event_ticket');
    expect(list).not.toContain('model-resource_booking');
  });

  it('keeps the web-only Tables row a link-out (no appRoute) for table venues', () => {
    const dests = buildDestinations(
      ctx({ isAdmin: false, enabledModels: new Set<BookingModel>(['table_reservation']) }),
    );
    const tables = dests.find((d) => d.id === 'model-table_reservation');
    expect(tables).toBeTruthy();
    expect(tables?.kind).toBe('web');
    expect(tables?.external).toBe(true);
    expect(tables?.target).toBe('/dashboard/tables');
  });

  it('renders model rows identically for staff and admin (model-driven, not role-gated)', () => {
    const models = new Set<BookingModel>(['class_session', 'event_ticket']);
    const staff = ids(ctx({ isAdmin: false, enabledModels: models })).filter((id) =>
      id.startsWith('model-'),
    );
    const admin = ids(ctx({ isAdmin: true, enabledModels: models })).filter((id) =>
      id.startsWith('model-'),
    );
    expect(staff).toEqual(admin);
  });
});

describe('buildDestinations — Import contacts (admin-only, in the app)', () => {
  it('is present for admins and opens the in-app import wizard', () => {
    const dests = buildDestinations(ctx({ isAdmin: true }));
    const importRow = dests.find((d) => d.id === 'import-contacts');
    expect(importRow).toBeTruthy();
    expect(importRow?.kind).toBe('route');
    expect(importRow?.external).toBeFalsy();
    expect(importRow?.target).toBe('/import');
    expect(importRow?.group).toBe('people');
    expect(importRow?.hint).not.toMatch(/web/i);
  });

  it('is hidden for non-admin staff', () => {
    expect(ids(ctx({ isAdmin: false }))).not.toContain('import-contacts');
  });
});

describe('buildDestinations — Compliance eligibility (tier + flag, staff + admin)', () => {
  it('shows Compliance to NON-admin staff on an appointment tier with the flag on', () => {
    const list = ids(
      ctx({ isAdmin: false, pricingTier: 'appointments', complianceEnabled: true }),
    );
    expect(list).toContain('compliance');
  });

  it('hides Compliance when the records flag is off (even for admins)', () => {
    const list = ids(ctx({ isAdmin: true, pricingTier: 'appointments', complianceEnabled: false }));
    expect(list).not.toContain('compliance');
  });

  it('hides Compliance on a non-appointment tier even with the flag on', () => {
    const list = ids(ctx({ isAdmin: true, pricingTier: 'restaurant', complianceEnabled: true }));
    expect(list).not.toContain('compliance');
  });

  // Compliance settings mirrors the web Settings → Compliance tab: admin +
  // appointment tier, NOT gated on the records flag (admins enable it there).
  it('shows Compliance settings to admins even with the records flag off', () => {
    const list = ids(ctx({ isAdmin: true, pricingTier: 'appointments', complianceEnabled: false }));
    expect(list).toContain('compliance-settings');
  });

  it('hides Compliance settings from non-admin staff (web SettingsView parity)', () => {
    const list = ids(
      ctx({ isAdmin: false, pricingTier: 'appointments', complianceEnabled: true }),
    );
    expect(list).not.toContain('compliance-settings');
  });

  it('hides Compliance settings on a non-appointment tier', () => {
    const list = ids(ctx({ isAdmin: true, pricingTier: 'restaurant', complianceEnabled: true }));
    expect(list).not.toContain('compliance-settings');
  });
});

describe('buildDestinations — Waitlist & Calendar-availability eligibility', () => {
  it('shows Waitlist when the waitlist feature is enabled', () => {
    expect(ids(ctx({ waitlistEnabled: true }))).toContain('waitlist');
  });

  it('shows Waitlist for table-reservation venues regardless of the flag', () => {
    const list = ids(
      ctx({ waitlistEnabled: false, enabledModels: new Set<BookingModel>(['table_reservation']) }),
    );
    expect(list).toContain('waitlist');
  });

  it('hides Waitlist for an appointment venue with the feature off', () => {
    const list = ids(
      ctx({
        waitlistEnabled: false,
        pricingTier: 'appointments',
        enabledModels: new Set<BookingModel>(['unified_scheduling']),
      }),
    );
    expect(list).not.toContain('waitlist');
  });

  it('shows Calendar availability for a scheduling-experience venue', () => {
    expect(ids(ctx({ pricingTier: 'appointments' }))).toContain('availability');
    expect(
      ids(ctx({ pricingTier: null, enabledModels: new Set<BookingModel>(['class_session']) })),
    ).toContain('availability');
  });

  it('hides Calendar availability for a table-only restaurant venue', () => {
    const list = ids(
      ctx({ pricingTier: 'restaurant', enabledModels: new Set<BookingModel>(['table_reservation']) }),
    );
    expect(list).not.toContain('availability');
  });
});

describe('buildDestinations — admin-only manage rows still gated', () => {
  it('hides Team / Communications etc. from non-admin staff', () => {
    const list = ids(ctx({ isAdmin: false }));
    for (const id of ['team', 'communications', 'booking-settings', 'refer-earn']) {
      expect(list).not.toContain(id);
    }
  });

  it('shows Plan & payments to staff too, read only, as the web shows them the Plan tab', () => {
    expect(ids(ctx({ isAdmin: false }))).toContain('plan');
  });

  it('preserves the Refer & Earn row for admins (Wave 2b — must not regress)', () => {
    expect(ids(ctx({ isAdmin: true }))).toContain('refer-earn');
  });
});

describe('buildDestinations — bento hierarchy & group coverage', () => {
  it('marks Today as the single primary (hero) tile and a featured tool', () => {
    const dests = buildDestinations(ctx({ isAdmin: true }));
    expect(dests.filter((d) => d.primary).map((d) => d.id)).toEqual(['today']);
    expect(dests.find((d) => d.id === 'today')?.featured).toBe(true);
  });

  it('keeps every featured tool in the workspace group', () => {
    const dests = buildDestinations(ctx({ isAdmin: true, waitlistEnabled: true }));
    for (const d of dests.filter((x) => x.featured)) {
      expect(d.group).toBe('workspace');
    }
  });

  it('assigns every destination to a surfaced group (a section, the bento, or the hero)', () => {
    // Guards against a future destination landing in a group that no surface
    // renders (the old "workspace non-featured rows never showed" class of bug).
    const surfaced = new Set<string>([...LIST_GROUPS.map((g) => g.key), 'workspace', 'account']);
    const dests = buildDestinations(
      ctx({
        isAdmin: true,
        enabledModels: new Set<BookingModel>(['class_session']),
        waitlistEnabled: true,
        complianceEnabled: true,
      }),
    );
    for (const d of dests) {
      expect(surfaced.has(d.group)).toBe(true);
    }
  });

  it('no longer dumps everything into a single "manage" group', () => {
    const groups = new Set(buildDestinations(ctx({ isAdmin: true })).map((d) => d.group));
    expect(groups.has('manage' as never)).toBe(false);
    // The former mega-list is now split across several purpose-built sections.
    expect(groups.has('setup')).toBe(true);
    expect(groups.has('people')).toBe(true);
    expect(groups.has('growth')).toBe(true);
    expect(groups.has('network')).toBe(true);
  });
});

describe('buildDestinations — the Collective area (web parity, 2026-09-17)', () => {
  it('offers Manage Collective to an admin in a live shared-services collective', () => {
    const dest = buildDestinations(ctx({ isAdmin: true, collectiveArea: { name: 'Plus 1 Staging' } })).find(
      (d) => d.id === 'collective-area',
    );
    expect(dest).toMatchObject({
      label: 'Manage Collective',
      hint: 'Services, venues and history of Plus 1 Staging',
      target: '/collective-area',
      group: 'network',
    });
  });

  it('is not offered without a live collective, nor to staff', () => {
    expect(ids(ctx({ isAdmin: true }))).not.toContain('collective-area');
    expect(ids(ctx({ isAdmin: false, collectiveArea: { name: 'Plus 1 Staging' } }))).not.toContain('collective-area');
  });
});

describe('buildDestinations — Checkout (POS app step 1, plan §4.22)', () => {
  const posIds = ['checkout', 'stock', 'checkout-settings', 'pos-records', 'stock-setup', 'import-products', 'loyalty-setup', 'commission-rates', 'commission-report', 'shop-settings', 'voucher-settings'];

  it('adds nothing when the POS switch is off or absent: the More tab is unchanged', () => {
    for (const isAdmin of [true, false]) {
      const before = buildDestinations(ctx({ isAdmin }));
      const off = buildDestinations(ctx({ isAdmin, posEnabled: false }));
      expect(off).toEqual(before);
      expect(off.map((d) => d.id).filter((id) => posIds.includes(id))).toEqual([]);
      expect(off.some((d) => d.group === 'checkoutSetup')).toBe(false);
    }
  });

  it('shows the Checkout tile in the workspace to everyone at a POS venue', () => {
    for (const isAdmin of [true, false]) {
      const tile = buildDestinations(ctx({ isAdmin, posEnabled: true })).find((d) => d.id === 'checkout');
      expect(tile).toMatchObject({ group: 'workspace', featured: true, kind: 'route', target: '/checkout' });
      expect(tile?.label).toBe('Checkout');
      expect(tile?.hint).not.toContain('—');
    }
  });

  it("puts Checkout's set-up screens in the app under Checkout set-up (owner, 2026-10-09)", () => {
    const admin = buildDestinations(ctx({ isAdmin: true, posEnabled: true })).filter((d) => d.group === 'checkoutSetup');
    // Settings first, then products and stock, then the records (owner, 2026-10-09).
    expect(admin.map((d) => d.id)).toEqual([
      'checkout-settings',
      'commission-rates',
      'stock-setup',
      'import-products',
      'pos-records',
      'commission-report',
    ]);
    expect(admin.every((d) => d.kind === 'route' && !d.external)).toBe(true);
    expect(admin.find((d) => d.id === 'checkout-settings')?.target).toBe('/checkout-settings');
    // A team member sees none of them without the matching permission.
    expect(buildDestinations(ctx({ isAdmin: false, posEnabled: true })).filter((d) => d.group === 'checkoutSetup')).toEqual([]);
  });

  it('offers Checkout settings and the records to a team member with the matching permission', () => {
    const staff = ids(ctx({ isAdmin: false, posEnabled: true, posCan: { manage_settings: true, view_reports: true } }));
    expect(staff).toContain('checkout-settings');
    expect(staff).toContain('pos-records');
    expect(staff).not.toContain('commission-rates');
    expect(ids(ctx({ isAdmin: false, posEnabled: true, posCan: { import_products: true } }))).toContain('import-products');
  });

  it('adds gift voucher settings for admins while vouchers are on', () => {
    expect(ids(ctx({ isAdmin: true, posEnabled: true, vouchersEnabled: true }))).toContain('voucher-settings');
    expect(ids(ctx({ isAdmin: true, posEnabled: true }))).not.toContain('voucher-settings');
    expect(ids(ctx({ isAdmin: false, posEnabled: true, vouchersEnabled: true }))).not.toContain('voucher-settings');
  });

  it('shows Products and stock to everyone at a POS venue (app step 4, UX spec §13.6)', () => {
    for (const isAdmin of [true, false]) {
      const tile = buildDestinations(ctx({ isAdmin, posEnabled: true })).find((d) => d.id === 'stock');
      expect(tile).toMatchObject({ group: 'workspace', kind: 'route', target: '/stock', label: 'Products and stock' });
      expect(tile?.hint).toBe('Stock levels, stocktakes and deliveries');
    }
  });

  it('shows Orders with its count of new orders only when the login may handle orders (app step 5)', () => {
    expect(ids(ctx({ isAdmin: true, posEnabled: true }))).not.toContain('orders');
    const tile = buildDestinations(ctx({ isAdmin: false, posEnabled: true, ordersEnabled: true, ordersNewCount: 3 })).find(
      (d) => d.id === 'orders',
    );
    expect(tile).toMatchObject({ group: 'workspace', kind: 'route', target: '/orders', label: 'Orders', hint: '3 new orders' });
    expect(buildDestinations(ctx({ isAdmin: true, posEnabled: true, ordersEnabled: true })).find((d) => d.id === 'orders')?.hint).toBe(
      'Online orders to prepare, send or hand over',
    );
    // Off with Checkout off, whatever else is said.
    expect(ids(ctx({ isAdmin: true, posEnabled: false, ordersEnabled: true }))).not.toContain('orders');
  });

  it('adds online shop settings for admins while the shop is on', () => {
    expect(ids(ctx({ isAdmin: true, posEnabled: true, shopEnabled: true }))).toContain('shop-settings');
    expect(ids(ctx({ isAdmin: false, posEnabled: true, shopEnabled: true }))).not.toContain('shop-settings');
    expect(ids(ctx({ isAdmin: true, posEnabled: true }))).not.toContain('shop-settings');
  });

  it('adds loyalty card set-up only while loyalty is on (Pass LC)', () => {
    expect(ids(ctx({ isAdmin: true, posEnabled: true }))).not.toContain('loyalty-setup');
    expect(ids(ctx({ isAdmin: true, posEnabled: true, loyaltyEnabled: true }))).toContain('loyalty-setup');
    expect(ids(ctx({ isAdmin: false, posEnabled: true, loyaltyEnabled: true }))).not.toContain('loyalty-setup');
  });
});
