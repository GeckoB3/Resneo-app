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
 *  - "Import contacts" is an admin-only link-out to /dashboard/import;
 *  - Compliance = appointment tier + records flag, shown to staff AND admin;
 *  - Waitlist / Calendar-availability follow model eligibility, not role.
 */
import {
  buildDestinations,
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

describe('buildDestinations — Import contacts (admin-only link-out)', () => {
  it('is present for admins and opens /dashboard/import via web kind', () => {
    const dests = buildDestinations(ctx({ isAdmin: true }));
    const importRow = dests.find((d) => d.id === 'import-contacts');
    expect(importRow).toBeTruthy();
    expect(importRow?.kind).toBe('web');
    expect(importRow?.external).toBe(true);
    expect(importRow?.target).toBe('/dashboard/import');
    expect(importRow?.group).toBe('manage');
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
  it('hides Team / Plan / Communications etc. from non-admin staff', () => {
    const list = ids(ctx({ isAdmin: false }));
    for (const id of ['team', 'plan', 'communications', 'booking-settings', 'refer-earn']) {
      expect(list).not.toContain(id);
    }
  });

  it('preserves the Refer & Earn row for admins (Wave 2b — must not regress)', () => {
    expect(ids(ctx({ isAdmin: true }))).toContain('refer-earn');
  });
});
