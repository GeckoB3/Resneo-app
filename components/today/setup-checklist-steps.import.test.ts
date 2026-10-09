/**
 * The setup checklist's "Import your bookings and customers" prompt opens the in-app import
 * wizard (`/import`), the same place as the More tab's "Import contacts", not the web dashboard.
 */
import { POST_ONBOARDING_SETUP_STEPS } from '@/components/today/setup-checklist-steps';

describe('setup checklist: import step', () => {
  const step = POST_ONBOARDING_SETUP_STEPS.find((s) => s.key === 'import_bookings_customers');

  it('is an in-app route to the import wizard', () => {
    expect(step).toBeTruthy();
    expect(step?.route).toBe('/import');
    expect(step?.webPath).toBeUndefined();
  });

  it('still completes when tapped, as the other prompts do', () => {
    expect(step?.completeOnClick).toBe(true);
  });
});
