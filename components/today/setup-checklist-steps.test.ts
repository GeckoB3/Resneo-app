/**
 * Setup-step derivation (Domain 17) — pure `getSteps` / `deriveSetupProgress`
 * port of the web `dashboard/SetupChecklist`. Covers which steps appear for
 * which primary model + enabled add-on models, onboarding-aware labels, and the
 * completion/progress maths.
 */
import {
  deriveSetupProgress,
  getSetupSteps,
  readEnabledModels,
} from '@/components/today/setup-checklist-steps';
import type { SetupStatus } from '@/lib/queries/useSetupStatus';

function status(partial: Partial<SetupStatus> = {}): SetupStatus {
  return {
    setup_checklist_dismissed: false,
    onboarding_completed: false,
    profile_complete: false,
    availability_set: false,
    guest_booking_ready: false,
    stripe_connected: false,
    first_booking_made: false,
    is_admin: true,
    booking_model: 'unified_scheduling',
    enabled_models: [],
    secondary_event_catalog_ready: true,
    secondary_class_catalog_ready: true,
    secondary_resource_catalog_ready: true,
    ...partial,
  };
}

function keys(s: SetupStatus): string[] {
  return getSetupSteps(s).map((step) => step.key);
}

describe('readEnabledModels', () => {
  it('returns string entries and ignores non-arrays / non-strings', () => {
    expect(readEnabledModels(status({ enabled_models: ['event_ticket', 1, null] }))).toEqual([
      'event_ticket',
    ]);
    expect(readEnabledModels(status({ enabled_models: undefined }))).toEqual([]);
    expect(readEnabledModels(status({ enabled_models: 'nope' as unknown as string[] }))).toEqual([]);
  });
});

describe('getSetupSteps — model-aware step set', () => {
  it('USE venue: profile → availability → booking page → stripe → first booking', () => {
    expect(keys(status({ booking_model: 'unified_scheduling' }))).toEqual([
      'profile_complete',
      'availability_set',
      'guest_booking_ready',
      'stripe_connected',
      'first_booking_made',
    ]);
  });

  it('table_reservation venue includes the booking-page step', () => {
    expect(keys(status({ booking_model: 'table_reservation' }))).toContain('guest_booking_ready');
  });

  it('event-only venue omits the booking-page step', () => {
    const k = keys(status({ booking_model: 'event_ticket' }));
    expect(k).not.toContain('guest_booking_ready');
    expect(k).toEqual([
      'profile_complete',
      'availability_set',
      'stripe_connected',
      'first_booking_made',
    ]);
  });

  it('appends a secondary catalog step per enabled add-on model, in order', () => {
    const k = keys(
      status({
        booking_model: 'unified_scheduling',
        enabled_models: ['event_ticket', 'class_session', 'resource_booking'],
      }),
    );
    expect(k).toEqual([
      'profile_complete',
      'availability_set',
      'guest_booking_ready',
      'secondary_event_catalog_ready',
      'secondary_class_catalog_ready',
      'secondary_resource_catalog_ready',
      'stripe_connected',
      'first_booking_made',
    ]);
  });

  it('only adds the enabled add-on models', () => {
    const k = keys(status({ enabled_models: ['class_session'] }));
    expect(k).toContain('secondary_class_catalog_ready');
    expect(k).not.toContain('secondary_event_catalog_ready');
    expect(k).not.toContain('secondary_resource_catalog_ready');
  });

  it('relabels the availability step on onboarding completion', () => {
    const pre = getSetupSteps(status({ booking_model: 'unified_scheduling', onboarding_completed: false }));
    const post = getSetupSteps(status({ booking_model: 'unified_scheduling', onboarding_completed: true }));
    const availPre = pre.find((s) => s.key === 'availability_set');
    const availPost = post.find((s) => s.key === 'availability_set');
    expect(availPre?.label).toBe('Team & services');
    expect(availPost?.label).toBe('Services & calendars');
  });

  it('maps add-on catalog steps to the in-app routes', () => {
    const steps = getSetupSteps(
      status({ enabled_models: ['event_ticket', 'class_session', 'resource_booking'] }),
    );
    const route = (key: string) => steps.find((s) => s.key === key)?.route;
    expect(route('secondary_event_catalog_ready')).toBe('/events');
    expect(route('secondary_class_catalog_ready')).toBe('/classes');
    expect(route('secondary_resource_catalog_ready')).toBe('/resources');
  });
});

describe('deriveSetupProgress — completion + progress', () => {
  it('counts only the derived steps and computes a rounded percentage', () => {
    // USE venue with no add-ons → 5 steps; profile + availability done = 2/5 = 40%.
    const p = deriveSetupProgress(
      status({ booking_model: 'unified_scheduling', profile_complete: true, availability_set: true }),
    );
    expect(p.totalCount).toBe(5);
    expect(p.completedCount).toBe(2);
    expect(p.progressPct).toBe(40);
    expect(p.incompleteSteps.map((s) => s.key)).toEqual([
      'guest_booking_ready',
      'stripe_connected',
      'first_booking_made',
    ]);
    expect(p.allComplete).toBe(false);
  });

  it('flags allComplete only when every derived step is done', () => {
    const done = status({
      booking_model: 'unified_scheduling',
      profile_complete: true,
      availability_set: true,
      guest_booking_ready: true,
      stripe_connected: true,
      first_booking_made: true,
    });
    expect(deriveSetupProgress(done).allComplete).toBe(true);
    expect(deriveSetupProgress(done).progressPct).toBe(100);
  });

  it('an enabled add-on whose catalog is NOT ready keeps the card incomplete', () => {
    // All base steps done, but resources enabled + catalog not ready → still incomplete.
    const s = status({
      booking_model: 'unified_scheduling',
      enabled_models: ['resource_booking'],
      profile_complete: true,
      availability_set: true,
      guest_booking_ready: true,
      stripe_connected: true,
      first_booking_made: true,
      secondary_resource_catalog_ready: false,
    });
    const p = deriveSetupProgress(s);
    expect(p.allComplete).toBe(false);
    expect(p.incompleteSteps.map((step) => step.key)).toEqual(['secondary_resource_catalog_ready']);
  });
});
